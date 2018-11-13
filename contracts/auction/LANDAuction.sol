pragma solidity ^0.4.24;

import "openzeppelin-eth/contracts/ownership/Ownable.sol";
import "openzeppelin-eth/contracts/math/SafeMath.sol";
import "openzeppelin-eth/contracts/utils/Address.sol";

import "./LANDAuctionStorage.sol";


contract LANDAuction is Ownable, LANDAuctionStorage {
    using SafeMath for uint256;
    using Address for address;

    /**
    * @dev Constructor of the contract.
    * Note that the last value of _xPoints will be the total duration and
    * the first value of _yPoints will be the initial price and the last value will be the endPrice
    * @param _xPoints - uint256[] of seconds
    * @param _yPoints - uint256[] of prices
    * @param _manaToken - address of the MANA token
    * @param _landRegistry - address of the LANDRegistry
    * @param _dex - address of the Dex to convert ERC20 tokens allowed to MANA
    */
    constructor(
        uint256[] _xPoints,
        uint256[] _yPoints,
        ERC20 _manaToken,
        LANDRegistry _landRegistry,
        address _dex
    ) public {
        // Initialize owneable
        Ownable.initialize(msg.sender);

        // Set LANDRegistry
        require(
            address(_landRegistry).isContract(),
            "The LANDRegistry token address must be a deployed contract"
        );
        landRegistry = _landRegistry;

        // Set Dex
        if (_dex != address(0)) {
            setDex(_dex);
        }

        // Set MANAToken
        allowToken(address(_manaToken), 18, true);
        manaToken = _manaToken;

        // Set total duration of the auction
        duration = _xPoints[_xPoints.length - 1];
        require(duration > 24 * 60 * 60, "The duration should be greater than 1 day");

        // Set Curve
        _setCurve(_xPoints, _yPoints);

        // Initialize status
        status = Status.created;

        emit AuctionCreated(
            msg.sender,
            initialPrice,
            endPrice,
            duration
        );
    }

    /**
    * @dev Start the auction
    * @param _landsLimitPerBid - uint256 LANDs limit for a single bid
    * @param _gasPriceLimit - uint256 gas price limit for a single bid
    */
    function startAuction(
        uint256 _landsLimitPerBid,
        uint256 _gasPriceLimit
    )
    external onlyOwner
    {
        require(status == Status.created, "The auction was started");

        setLandsLimitPerBid(_landsLimitPerBid);
        setGasPriceLimit(_gasPriceLimit);

        startedTime = block.timestamp;
        status = Status.started;

        emit AuctionStarted(msg.sender, startedTime);
    }

    /**
    * @dev Burn the MANA earned by the auction
    */
    function burnFunds() external {
        require(
            status == Status.finished,
            "Burn should be performed when the auction is finished"
        );
        uint256 balance = manaToken.balanceOf(address(this));
        require(
            balance > 0,
            "No MANA to burn"
        );
        manaToken.burn(balance);

        emit MANABurned(msg.sender, balance);
    }

    /**
    * @dev Make a bid for LANDs
    * @param _xs - uint256[] x values for the LANDs to bid
    * @param _ys - uint256[] y values for the LANDs to bid
    * @param _beneficiary - address beneficiary for the LANDs to bid
    * @param _fromToken - token used to bid
    */
    function bid(
        int[] _xs,
        int[] _ys,
        address _beneficiary,
        ERC20 _fromToken
    ) external
    {
        require(status == Status.started, "The auction was not started");
        require(block.timestamp - startedTime <= duration, "The auction has finished");
        require(tx.gasprice <= gasPriceLimit, "Gas price limit exceeded");
        require(_beneficiary != address(0), "The beneficiary could not be 0 address");
        require(_xs.length > 0, "You should bid to at least one LAND");
        require(_xs.length <= landsLimitPerBid, "LAND limit exceeded");
        require(_xs.length == _ys.length, "X values length should be equal to Y values length");
        require(tokensAllowed[address(_fromToken)].isAllowed, "Token not allowed");

        uint256 currentPrice = getCurrentPrice();
        uint256 totalPrice = _xs.length.mul(currentPrice);

        if (address(_fromToken) != address(manaToken)) {
            require(
                address(dex).isContract(),
                "Pay with other token than MANA is not available"
            );
            // Convert _fromToken to MANA
            require(_convertSafe(_fromToken, totalPrice), "Converting token to MANA failed");
        } else {
            // Transfer MANA to LANDAuction contract
            require(
                _fromToken.transferFrom(msg.sender, address(this), totalPrice),
                "Transfering the totalPrice to LANDAuction contract failed"
            );
        }

        // Assign LANDs to _beneficiary
        for (uint i = 0; i < _xs.length; i++) {
            int x = _xs[i];
            int y = _ys[i];
            require(
                -150 <= x && x <= 150 && -150 <= y && y <= 150,
                "The coordinates should be inside bounds -150 & 150"
            );
        }
        landRegistry.assignMultipleParcels(_xs, _ys, _beneficiary);


        emit BidSuccessful(
            _beneficiary,
            _fromToken,
            currentPrice,
            totalPrice,
            _xs,
            _ys
        );
    }

    /**
    * @dev Allow many ERC20 tokens to to be used for bidding
    * @param _address - array of addresses of the ERC20 Token
    * @param _decimals - array of uint256 of the number of decimals
    * @param _shouldKeepToken - array of boolean whether we should keep the token or not
    */
    function allowManyTokens(
        address[] _address,
        uint256[] _decimals,
        bool[] _shouldKeepToken
    ) external onlyOwner
    {
        require(
            _address.length == _decimals.length && _decimals.length == _shouldKeepToken.length,
            "The length of _addresses, decimals and _shouldKeepToken should be the same"
        );

        for (uint i = 0; i < _address.length; i++) {
            allowToken(_address[i], _decimals[i], _shouldKeepToken[i]);
        }
    }

    /**
    * @dev Current LAND price.
    * Note that if the auction was not started returns the started price and when
    * the auction is finished return the endPrice
    * @return uint256 current LAND price
    */
    function getCurrentPrice() public view returns (uint256) {
        if (startedTime == 0) {
            return initialPrice;
        } else {
            uint256 timePassed = block.timestamp - startedTime;
            if (timePassed >= duration) {
                return endPrice;
            }
            return _getPrice(timePassed);
        }
    }

    /**
    * @dev Finish auction
    */
    function finishAuction() public onlyOwner {
        require(status != Status.finished, "The auction is finished");
        status = Status.finished;

        uint256 currentPrice = getCurrentPrice();
        emit AuctionEnded(msg.sender, block.timestamp, currentPrice);
    }

    /**
    * @dev Set LANDs limit for the auction
    * @param _landsLimitPerBid - uint256 LANDs limit for a single id
    */
    function setLandsLimitPerBid(uint256 _landsLimitPerBid) public onlyOwner {
        require(_landsLimitPerBid > 0, "The lands limit should be greater than 0");
        emit LandsLimitPerBidChanged(msg.sender, landsLimitPerBid, _landsLimitPerBid);
        landsLimitPerBid = _landsLimitPerBid;
    }

    /**
    * @dev Set gas price limit for the auction
    * @param _gasPriceLimit - uint256 gas price limit for a single bid
    */
    function setGasPriceLimit(uint256 _gasPriceLimit) public onlyOwner {
        require(_gasPriceLimit > 0, "The gas price should be greater than 0");
        emit GasPriceLimitChanged(msg.sender, gasPriceLimit, _gasPriceLimit);
        gasPriceLimit = _gasPriceLimit;
    }

    /**
    * @dev Set dex to convert ERC20
    * @param _dex - address of the token converter
    */
    function setDex(address _dex) public onlyOwner {
        require(_dex != address(dex), "The dex is the current");
        if (_dex != address(0)) {
            require(_dex.isContract(), "The dex address must be a deployed contract");
        }
        emit DexChanged(msg.sender, dex, _dex);
        dex = ITokenConverter(_dex);
    }

    /**
    * @dev Allow ERC20 to to be used for bidding
    * @param _address - address of the ERC20 Token
    * @param _decimals - uint256 of the number of decimals
    * @param _shouldKeepToken - boolean whether we should keep the token or not
    */
    function allowToken(
        address _address,
        uint256 _decimals,
        bool _shouldKeepToken)
    public onlyOwner
    {
        require(
            _address.isContract(),
            "Tokens allowed should be a deployed ERC20 contract"
        );
        require(
            _decimals > 0 && _decimals <= 18,
            "Decimals should be greather than 0 and less or equal to 18"
        );
        require(!tokensAllowed[_address].isAllowed, "The ERC20 token is already allowed");

        tokensAllowed[_address] = tokenAllowed({
            decimals: _decimals,
            shouldKeepToken: _shouldKeepToken,
            isAllowed: true
        });

        emit TokenAllowed(
            msg.sender,
            _address,
            _decimals,
            _shouldKeepToken
        );
    }

    /**
    * @dev Disable ERC20 to to be used for bidding
    * @param _address - address of the ERC20 Token
    */
    function disableToken(address _address) public onlyOwner {
        require(
            tokensAllowed[_address].isAllowed,
            "The ERC20 token is already disabled"
        );
        delete tokensAllowed[_address];
        emit TokenDisabled(msg.sender, _address);
    }

    /**
    * @dev Convert allowed token to MANA and transfer the change in MANA to the sender
    * Note that we will use the slippageRate cause it has a 3% buffer
    * @param _fromToken - ERC20 token to be converted
    * @param _totalPrice - uint256 of the total amount in MANA
    * @return bool to confirm the convertion was successfully
    */
    function _convertSafe(ERC20 _fromToken, uint256 _totalPrice) internal returns (bool) {
        uint256 prevBalance = manaToken.balanceOf(address(this));

        uint256 tokenRate;
        (, tokenRate) = dex.getExpectedRate(manaToken, _fromToken, _totalPrice);

        uint256 totalPriceInToken = _totalPrice.mul(tokenRate).div(10 ** 18);

        uint256 fromTokenDecimals = tokensAllowed[address(_fromToken)].decimals;
        // Normalize to _fromToken decimals and calculate the amount of tokens to convert
        if (MAX_DECIMALS > fromTokenDecimals) {
             // Ceil the result of the normalization always fue to convertions fee
            totalPriceInToken = totalPriceInToken
            .div(10**(MAX_DECIMALS - fromTokenDecimals))
            .add(1);
        }

        require(
            _fromToken.transferFrom(msg.sender, address(this), totalPriceInToken),
            "Transfering the totalPrice in token to LANDAuction contract failed"
        );

        require(_fromToken.approve(address(dex), totalPriceInToken), "Error approve");

        // Convert token to MANA
        uint256 bought = dex.convert(
                _fromToken,
                manaToken,
                totalPriceInToken,
                _totalPrice
            );

        require(
            manaToken.balanceOf(address(this)).sub(prevBalance) >= bought,
            "Bought amount incorrect"
        );

        if (bought > _totalPrice) {
            // Return change in MANA to sender
            uint256 change = bought.sub(_totalPrice);
            require(
                manaToken.transfer(msg.sender, change),
                "Transfering the change to sender failed"
            );
        }

        require(_fromToken.approve(address(dex), 0), "Error remove approve");
        return true;
    }

    /**
    * @dev Create a combined function.
    * note that we will set N - 1 function combinations based on N points (x,y)
    * @param _xPoints - uint256[] of x values
    * @param _yPoints - uint256[] of y values
    */
    function _setCurve(uint256[] _xPoints, uint256[] _yPoints) internal {
        uint256 pointsLength = _xPoints.length;
        require(pointsLength == _yPoints.length, "Points should have the same length");
        for (uint i = 0; i < pointsLength - 1; i++) {
            uint256 x1 = _xPoints[i];
            uint256 x2 = _xPoints[i 1];
            uint256 y1 = _yPoints[i];
            uint256 y2 = _yPoints[i 1];
            require(x1 < x2, "X points should increase");
            require(y1 > y2, "Y points should decrease");
            curves.push(Func({
                xPoints: [x1, x2],
                yPoints: [y1, y2]
            }));
        }

        initialPrice = _yPoints[0];
        endPrice = _yPoints[pointsLength - 1];
    }


    /**
    * @dev LAND price based on time
    * Note that will select the function to calculate based on the time
    * It should return endPrice if _time < duration
    * @param _time - uint256 time passed before reach duration
    * @return uint256 price for the given time
    */
    function _getPrice(uint256 _time) internal view returns (uint256) {
        for (uint i = 0; i < curves.length; i++) {
            Func memory func = curves[i];
            uint256 x2 = func.xPoints[1];
            if (_time < x2) {
                uint256 x1 = func.xPoints[0];
                uint256 y1 = func.yPoints[0];
                uint256 y2 = func.yPoints[1];
                return _calculate(
                    x1,
                    x2,
                    y1,
                    y2,
                    _time
                );
            }
        }
    }

    /**
    * @dev Calculate LAND price based on time
    * It is a linear function y = ax - b. But The slope should be negative.
    * As Solidity does not support negative number we use it as: y = b - ax
    * Based on two points (x1; x2) and (y1; y2)
    * slope = (y1 - y2) / (x2 - x1) to avoid negative maths
    * @param _x1 - uint256 x1 value
    * @param _x2 - uint256 x2 value
    * @param _y1 - uint256 y1 value
    * @param _y2 - uint256 y2 value
    * @param _val - uint256 val passed before reach duration
    * @return uint256 price for the given time
    */
    function _calculate(
        uint256 _x1,
        uint256 _x2,
        uint256 _y1,
        uint256 _y2,
        uint256 _val
    ) internal pure returns (uint256)
    {
        uint256 b = ((_x2.mul(_y1)).sub(_x1.mul(_y2))).div(_x2.sub(_x1));
        uint256 slope = (_y1.sub(_y2)).mul(_val).div(_x2.sub(_x1));
        return b.sub(slope);
    }
}
