pragma solidity ^0.4.24;

import "openzeppelin-eth/contracts/ownership/Ownable.sol";
import "openzeppelin-eth/contracts/math/SafeMath.sol";
import "openzeppelin-eth/contracts/utils/Address.sol";

import "./LANDAuctionStorage.sol";


contract LANDAuction is Ownable, LANDAuctionStorage {
    using SafeMath for uint256;
    using Address for address;

    /**
    * @dev Constructor of the contract
    * @param _initialPrice - uint256 initial LAND price
    * @param _endPrice - uint256 end LAND price
    * @param _duration - uint256 duration of the auction in seconds
    * @param _manaToken - address of the MANA token
    * @param _landRegistry - address of the LANDRegistry
    * @param _dex - address of the Dex to convert ERC20 tokens allowed to MANA
    * @param _allowedTokens - array of ERC20 addresses allowed to bid
    */
    constructor(
        uint256 _initialPrice, 
        uint256 _endPrice, 
        uint256 _duration, 
        ERC20 _manaToken, 
        LANDRegistry _landRegistry,
        address _dex,
        address[] _allowedTokens
    ) public {
        Ownable.initialize(msg.sender);
        Pausable.initialize(msg.sender);

        require(address(_landRegistry).isContract(), "The LANDRegistry token address must be a deployed contract");
        landRegistry = _landRegistry;

        setDex(_dex);

        allowToken(address(_manaToken));
        manaToken = _manaToken;

        for (uint i = 0; i < _allowedTokens.length; i++) {
            address allowedToken = _allowedTokens[i];            
            allowToken(allowedToken);
        }


        require(_initialPrice > _endPrice, "The start price should be greater than end price");
        require(_duration > 24 * 60 * 60, "The duration should be greater than 1 day");

        duration = _duration;
        initialPrice = _initialPrice;
        endPrice = _endPrice;

        require(
            endPrice == _getPrice(duration),
            "The end price defined should be achieved when auction ends"
        );

        status = Status.created;

        Ownable.initialize(msg.sender);

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
    * @dev Make a bid for LANDs
    * @param _xs - uint256[] x values for the LANDs to bid
    * @param _ys - uint256[] y values for the LANDs to bid
    * @param _beneficiary - address beneficiary for the LANDs to bid
    * @param _fromToken - ERC20 accepted
    */
    function bidWithToken(int[] _xs, int[] _ys, address _beneficiary, ERC20 _fromToken) external whenNotPaused {
        //require(address(dex).isContract(), "Dex not available");
        _bid(_xs, _ys, _beneficiary, _fromToken);
    }

    /**
    * @dev Make a bid for LANDs
    * @param _xs - uint256[] x values for the LANDs to bid
    * @param _ys - uint256[] y values for the LANDs to bid
    * @param _beneficiary - address beneficiary for the LANDs to bid
    */
    function bid(int[] _xs, int[] _ys, address _beneficiary) external whenNotPaused {
        _bid(_xs, _ys, _beneficiary, manaToken);
    }

    /**
    * @dev Make a bid for LANDs
    * @param _xs - uint256[] x values for the LANDs to bid
    * @param _ys - uint256[] y values for the LANDs to bid
    * @param _beneficiary - address beneficiary for the LANDs to bid
    * @param _fromToken - token used to bid
    */
    function _bid(int[] _xs, int[] _ys, address _beneficiary, ERC20 _fromToken) internal {
        require(status == Status.started, "The auction was not started");
        require(block.timestamp - startedTime <= duration, "The auction has finished");
        require(tx.gasprice <= gasPriceLimit, "Gas price limit exceeded");
        require(_beneficiary != address(0), "The beneficiary could not be 0 address");
        require(_xs.length > 0, "You should bid to at least one LAND");
        require(_xs.length <= landsLimitPerBid, "LAND limit exceeded");
        require(_xs.length == _ys.length, "X values length should be equal to Y values length");
        require(tokensAllowed[address(_fromToken)], "token not accepted");


        uint256 amount = _xs.length;
        uint256 currentPrice = getCurrentPrice();
        uint256 totalPrice = amount.mul(currentPrice);

        if (address(_fromToken) != address(manaToken)) {
            // Convert _fromToken to MANA
            require(convertSafe(_fromToken, totalPrice), "all good");
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
            currentPrice,
            totalPrice,
            _xs,
            _ys
        );
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
    * @dev Current LAND price. If the auction was not started returns the started price
    * @return uint256 current LAND price
    */
    function getCurrentPrice() public view returns (uint256) { 
        if (startedTime == 0) {
            return _getPrice(0);
        } else {
            uint256 timePassed = block.timestamp - startedTime;
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
        if (_dex != address(0)) {
            require(_dex.isContract(), "The dex address must be a deployed contract");
            emit DexChanged(msg.sender, dex, _dex);
        }
        dex = ITokenConverter(_dex);
    }

    /**
    * @dev Allow ERC20 to to be used for bidding
    * @param _address - address of the ERC20 Token
    */
    function allowToken(address _address) public onlyOwner {
        require(
            _address.isContract(),
            "Tokens allowed should be a deployed ERC20 contract"
        );
        require(!tokensAllowed[_address], "The ERC20 token is already allowed");
        tokensAllowed[_address] = true;
        emit TokenAllowed(msg.sender, _address);
    }

    /**
    * @dev Disable ERC20 to to be used for bidding
    * @param _address - address of the ERC20 Token
    */
    function disableToken(address _address) public onlyOwner {
        require(tokensAllowed[_address], "The ERC20 token is already disabled");
        tokensAllowed[_address] = false;
        emit TokenDisabled(msg.sender, _address);
    }

    /**
    * @dev Calculate LAND price based on time
    * It is a linear function y = ax - b. But The slope should be negative.
    * Based on two points (initialPrice; startedTime = 0) and (endPrice; endTime = duration)
    * slope = (endPrice - startedPrice) / (duration - startedTime)
    * As Solidity does not support negative number we use it as: y = b - ax
    * It should return endPrice if _time < duration
    * @param _time - uint256 time passed before reach duration
    * @return uint256 price for the given time
    */
    function _getPrice(uint256 _time) internal view returns (uint256) {
        if (_time >= duration) {
            return endPrice;
        }
        return  initialPrice.sub(initialPrice.sub(endPrice).mul(_time).div(duration));
    }

    function convertSafe(ERC20 _fromToken, uint256 _totalPrice) internal returns (bool) {
        uint256 prevBalance = manaToken.balanceOf(address(this));
        uint256 tokenRate;
        (tokenRate, ) = dex.getExpectedRate(_fromToken, manaToken, _totalPrice);
        uint256 totalPriceInToken = _totalPrice.mul(tokenRate).div(10 ** 18);
        require(
            _fromToken.transferFrom(msg.sender, address(this), totalPriceInToken),
            "Transfering the totalPrice in token to LANDAuction contract failed"
        );
        require(_fromToken.approve(address(dex), totalPriceInToken), "Error approve");
        uint256 bought = dex.convert(_fromToken, manaToken, totalPriceInToken, 1);
        require(manaToken.balanceOf(address(this)).sub(prevBalance) >= bought, "Bought amount incorrect");
        if (bought > _totalPrice) {
            // return mana to sender
            uint256 change = bought.sub(_totalPrice);
            require(
                manaToken.transfer(msg.sender, change),
                "Transfering the change to sender failed"
            );
        }
        require(_fromToken.approve(address(dex), 0), "Error remove approve");
        return true;
    }
}