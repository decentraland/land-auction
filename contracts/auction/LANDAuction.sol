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
    * @param _startTime - uint256 timestamp in seconds when the auction will start
    * @param _landsLimitPerBid - uint256 LANDs limit for a single bid
    * @param _gasPriceLimit - uint256 gas price limit for a single bid
    * @param _manaToken - address of the MANA token
    * @param _landRegistry - address of the LANDRegistry
    * @param _dex - address of the Dex to convert ERC20 tokens allowed to MANA
    */
    constructor(
        uint256[] _xPoints, 
        uint256[] _yPoints, 
        uint256 _startTime,
        uint256 _landsLimitPerBid,
        uint256 _gasPriceLimit,
        ERC20 _manaToken, 
        ERC20 _daiToken,
        LANDRegistry _landRegistry,
        address _dex,
        address _daiCharity,
        address _tokenKiller
    ) public {
        // Initialize owneable
        Ownable.initialize(msg.sender);

        // Schedule auction
        require(_startTime > block.timestamp, "Started time should be after now");
        startTime = _startTime;

        // Set LANDRegistry
        require(
            address(_landRegistry).isContract(),
            "The LANDRegistry token address must be a deployed contract"
        );
        landRegistry = _landRegistry;

        require(
            address(_daiCharity).isContract(),
            "The DAI Charity token address must be a deployed contract"
        );
        daiCharity = _daiCharity;

        require(
            address(_tokenKiller).isContract(),
            "The Token Killer must be a deployed contract"
        );
        tokenKiller = _tokenKiller;


        setDex(_dex);

        // Set MANAToken
        allowToken(address(_manaToken), 18, true);
        manaToken = _manaToken;

        // Allow DAI and keep tokens
        allowToken(address(_daiToken), 18, true);
        daiToken = _daiToken;

        // Set total duration of the auction
        duration = _xPoints[_xPoints.length - 1];
        require(duration > 24 * 60 * 60, "The duration should be greater than 1 day");

        // Set Curve
        _setCurve(_xPoints, _yPoints);

        // Set limits
        setLandsLimitPerBid(_landsLimitPerBid);
        setGasPriceLimit(_gasPriceLimit);
        
        // Initialize status
        status = Status.created;      

        emit AuctionCreated(
            msg.sender,
            _startTime,
            duration,
            initialPrice, 
            endPrice
        );
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
        _validateBidParameters(
            _xs, 
            _ys, 
            _beneficiary, 
            _fromToken
        );
        
        uint256 bidId = _getBidId();
        uint256 currentPrice = getCurrentPrice();
        uint256 totalPrice = _xs.length.mul(currentPrice);
        
        if (address(_fromToken) != address(manaToken)) {
            require(
                address(dex).isContract(), 
                "Pay with other token than MANA is not available"
            );
            // Convert _fromToken to MANA
            totalPrice = _convertSafe(bidId, _fromToken, totalPrice);
        } else {
            // Transfer MANA to LANDAuction contract
            require(
                _fromToken.transferFrom(msg.sender, address(this), totalPrice),
                "Transfering the totalPrice to LANDAuction contract failed"
            );
        }

        // Burn Transferred funds
        _burnFunds(bidId, _fromToken);

        // Assign LANDs to _beneficiary
        for (uint i = 0; i < _xs.length; i++) {
            require(
                -150 <= _xs[i] && _xs[i] <= 150 && -150 <= _ys[i] && _ys[i] <= 150,
                "The coordinates should be inside bounds -150 & 150"
            );
        }
        landRegistry.assignMultipleParcels(_xs, _ys, _beneficiary);

        emit BidSuccessful(
            bidId,
            _beneficiary,
            _fromToken,
            currentPrice,
            totalPrice,
            _xs,
            _ys
        );  

        // Increment bids count
        _incrementBids();
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
    * @dev Set conversion fee rate
    * @param _fee - uint256 for the new conversion rate
    */
    function setConversionFee(uint256 _fee) external onlyOwner {
        require(_fee < 200 && _fee >= 100, "Conversion fee should be >= 100 and < 200");
        emit ConversionFeeChanged(msg.sender, conversionFee, _fee);
        conversionFee = _fee;
    }

    /**
    * @dev Current LAND price. 
    * Note that if the auction was not started returns the initial price and when
    * the auction is finished return the endPrice
    * @return uint256 current LAND price
    */
    function getCurrentPrice() public view returns (uint256) { 
        // If the auction has not started returns initialPrice
        if (startTime == 0 || startTime >= block.timestamp) {
            return initialPrice;
        }

        // If the auction has finished returns endPrice
        uint256 timePassed = block.timestamp - startTime;
        if (timePassed >= duration) {
            return endPrice;
        }

        return _getPrice(timePassed);
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
            _decimals > 0 && _decimals <= MAX_DECIMALS,
            "Decimals should be greather than 0 and less or equal to 18"
        );
        require(!tokensAllowed[_address].isAllowed, "The ERC20 token is already allowed");

        tokensAllowed[_address] = Token({
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
    * @dev Get exchange rate
    * @param _srcToken - IERC20 token
    * @param _destToken - IERC20 token 
    * @param _srcAmount - uint256 amount to be converted
    * @return uint256 of the rate
    */
    function getRate(
        IERC20 _srcToken, 
        IERC20 _destToken, 
        uint256 _srcAmount
    ) public view returns (uint256 rate) 
    {
        (, rate) = dex.getExpectedRate(_srcToken, _destToken, _srcAmount);
    }

    /**
    * @dev Convert allowed token to MANA and transfer the change in the original token
    * Note that we will use the slippageRate cause it has a 3% buffer and a deposit of 5% to cover
    * the conversion fee.
    * @param _bidId - uint256 of the bid Id
    * @param _fromToken - ERC20 token to be converted
    * @param _totalPrice - uint256 of the total amount in MANA
    * @return uint256 of the total amount of MANA
    */
    function _convertSafe(
        uint256 _bidId,
        ERC20 _fromToken,
        uint256 _totalPrice
    ) internal returns (uint256 totalPrice)
    {
        totalPrice = _totalPrice;
        Token memory fromToken = tokensAllowed[address(_fromToken)];

        uint totalPriceWithDeposit = totalPrice.mul(conversionFee).div(100);

        // Save prev _fromToken balance 
        uint256 prevTokenBalance = _fromToken.balanceOf(address(this));

        // Get rate
        uint256 tokenRate = getRate(manaToken, _fromToken, totalPriceWithDeposit);

        // Check if contract should keep a percentage of _fromToken
        uint256 tokensToKeep = 0;
        if (fromToken.shouldKeepToken) {
            (tokensToKeep, totalPrice) = _calculateTokensToKeep(totalPrice, tokenRate);
        }

        // Calculate the amount of _fromToken needed
        uint256 totalPriceInToken = totalPriceWithDeposit.mul(tokenRate).div(10 ** 18);

        // Normalize to _fromToken decimals
        if (MAX_DECIMALS > fromToken.decimals) {
            (tokensToKeep, totalPriceInToken) = _normalizeDecimals(
                fromToken.decimals, 
                tokensToKeep, 
                totalPriceInToken
            );
         }

        // Transfer _fromToken amount from sender to the contract
        require(
            _fromToken.transferFrom(msg.sender, address(this), totalPriceInToken),
            "Transfering the totalPrice in token to LANDAuction contract failed"
        );
        
        // Approve amount of _fromToken owned by contract to be used by dex contract
        require(_fromToken.approve(address(dex), totalPriceInToken), "Error approve");

        // Convert _fromToken to MANA
        require(
            dex.convert(
                _fromToken,
                manaToken,
                totalPriceInToken,
                totalPrice
            ), 
            "Could not convert tokens"
        );

       // Return change in _fromToken to sender
        uint256 change = _fromToken.balanceOf(address(this)) - prevTokenBalance - tokensToKeep;
        if (change > 0) {
            // Return the change of src token
            require(
                _fromToken.transfer(msg.sender, change),
                "Transfering the change to sender failed"
            );
        }

        // Remove approval of _fromToken owned by contract to be used by dex contract
        require(_fromToken.approve(address(dex), 0), "Error remove approval");

        emit BidConversion(
            _bidId,
            address(_fromToken),
            totalPrice,
            totalPriceInToken - change,
            tokensToKeep
        );
    }

    /** 
    * @dev Calculate the amount of tokens to keep and the total price in MANA
    * Note that PERCENTAGE_OF_TOKEN_TO_KEEP will be always less than 100
    * @param _totalPrice - uint256 price to calculate percentage to keep
    * @param _tokenRate - rate to calculate the amount of tokens
    * @return tokensToKeep - uint256 of the amount of tokens to keep
    * @return totalPrice - uint256 of the new total price in MANA
    */
    function _calculateTokensToKeep(uint256 _totalPrice, uint256 _tokenRate) 
    internal pure returns (uint256 tokensToKeep, uint256 totalPrice) 
    {
        tokensToKeep = _totalPrice.mul(_tokenRate)
            .div(10 ** 18)
            .mul(PERCENTAGE_OF_TOKEN_TO_KEEP)
            .div(100);
            
        totalPrice = _totalPrice.mul(100 - PERCENTAGE_OF_TOKEN_TO_KEEP).div(100);
    }

    /** 
    * @dev Normalize to _fromToken decimals
    * @param _decimals - uint256 of _fromToken decimals
    * @param _tokensToKeep - uint256 of the amount of tokens to keep
    * @param _totalPriceInToken - uint256 of the amount of _fromToken
    * @return tokensToKeep - uint256 of the amount of tokens to keep in _fromToken decimals
    * @return totalPriceInToken - address beneficiary for the LANDs to bid in _fromToken decimals
    */
    function _normalizeDecimals(
        uint256 _decimals, 
        uint256 _tokensToKeep, 
        uint256 _totalPriceInToken
    ) 
    internal pure returns (uint256 tokensToKeep, uint256 totalPriceInToken) 
    {
        uint256 newDecimals = 10**MAX_DECIMALS.sub(_decimals);

        totalPriceInToken = _totalPriceInToken.div(newDecimals);
        tokensToKeep = _tokensToKeep.div(newDecimals);
    }

    /** 
    * @dev Validate bid function params
    * @param _xs - uint256[] x values for the LANDs to bid
    * @param _ys - uint256[] y values for the LANDs to bid
    * @param _beneficiary - address beneficiary for the LANDs to bid
    * @param _fromToken - token used to bid
    */
    function _validateBidParameters(
        int[] _xs, 
        int[] _ys, 
        address _beneficiary, 
        ERC20 _fromToken
    ) internal view 
    {
        require(startTime <= block.timestamp, "The auction has not started");
        require(
            status == Status.created && 
            block.timestamp.sub(startTime) <= duration, 
            "The auction has finished"
        );
        require(tx.gasprice <= gasPriceLimit, "Gas price limit exceeded");
        require(_beneficiary != address(0), "The beneficiary could not be 0 address");
        require(_xs.length > 0, "You should bid to at least one LAND");
        require(_xs.length <= landsLimitPerBid, "LAND limit exceeded");
        require(_xs.length == _ys.length, "X values length should be equal to Y values length");
        require(tokensAllowed[address(_fromToken)].isAllowed, "Token not allowed");
    }

    /**
    * @dev Burn the MANA and other tokens earned
    * @param _bidId - uint256 of the bid Id
    * @param _token - ERC20 token
    */
    function _burnFunds(uint256 _bidId, ERC20 _token) internal {
        if (_token != manaToken && tokensAllowed[address(_token)].shouldKeepToken) {
            // Burn no MANA token
            _burnToken(_bidId, _token);
        }

        // Burn MANA token
        _burnToken(_bidId, manaToken);       
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
            uint256 x2 = _xPoints[i + 1];
            uint256 y1 = _yPoints[i];
            uint256 y2 = _yPoints[i + 1];
            require(x1 < x2, "X points should increase");
            require(y1 > y2, "Y points should decrease");
            (uint256 base, uint256 slope) = _getFunc(
                x1, 
                x2, 
                y1, 
                y2
            );
            curves.push(Func({
                base: base,
                slope: slope,
                limit: x2
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
            if (_time < func.limit) {
                return func.base.sub(func.slope.mul(_time));
            }
        }
        revert("Invalid time");
    }

    /**
    * @dev Calculate base and slope for the given points
    * It is a linear function y = ax - b. But The slope should be negative.
    * As we want to avoid negative numbers in favor of using uints we use it as: y = b - ax
    * Based on two points (x1; x2) and (y1; y2)
    * base = (x2 * y1) - (x1 * y2) / x2 - x1
    * slope = (y1 - y2) / (x2 - x1) to avoid negative maths
    * @param _x1 - uint256 x1 value
    * @param _x2 - uint256 x2 value
    * @param _y1 - uint256 y1 value
    * @param _y2 - uint256 y2 value
    * @return uint256 for the base
    * @return uint256 for the slope
    */
    function _getFunc(
        uint256 _x1,
        uint256 _x2,
        uint256 _y1, 
        uint256 _y2
    ) internal pure returns (uint256 base, uint256 slope) 
    {
        base = ((_x2.mul(_y1)).sub(_x1.mul(_y2))).div(_x2.sub(_x1));
        slope = (_y1.sub(_y2)).div(_x2.sub(_x1));
    }

    /** 
    * @dev Burn tokens. 
    * Note that if the token is the DAI token we will transfer the funds 
    * to the DAI charity contract.
    * For the rest of the tokens if not implement the burn method 
    * we will transfer the funds to a token killer address
    * @param _bidId - uint256 of the bid Id
    * @param _token - ERC20 token
    */
    function _burnToken(uint256 _bidId, ERC20 _token) private {
        uint256 balance = _token.balanceOf(address(this));

        // Check if balance is valid
        require(balance > 0, "Balance to burn should be > 0");

        if (_token == daiToken) {
            // Transfer to DAI charity if token to burn is DAI
            require(
                _token.transfer(daiCharity, balance),
                "Could not transfer tokens to DAI charity" 
            );
        } else {
            // Burn funds
            bool result = _safeBurn(_token, balance);

            if (!result) {
                // If token does not implement burn method suicide tokens
                require(
                    _token.transfer(tokenKiller, balance),
                    "Could not transfer tokens to the token killer contract" 
                );
            }
        }

        emit TokenBurned(_bidId, address(_token), balance);

        // Check if balance of the auction contract is empty
        balance = _token.balanceOf(address(this));
        require(balance == 0, "Burn token failed");
    }

    /** 
    * @dev Execute burn method. 
    * Note that if the contract does not implement it will return false
    * @param _token - ERC20 token
    * @param _amount - uint256 of the amount to burn
    * @return bool if burn has been successfull
    */
    function _safeBurn(ERC20 _token, uint256 _amount) private returns (bool success) {
        success = address(_token).call(abi.encodeWithSelector(
            _token.burn.selector,
            _amount
        ));        
    }

    /**
    * @dev Return bid id
    * @return uint256 of the bid id
    */
    function _getBidId() private view returns (uint256) {
        return totalBids;
    }

    /** 
    * @dev Increments bid id 
    */
    function _incrementBids() private {
        totalBids = totalBids.add(1);
    }
}