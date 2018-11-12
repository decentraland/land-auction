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
    */
    constructor(
        uint256 _initialPrice, 
        uint256 _endPrice, 
        uint256 _duration, 
        ERC20 _manaToken, 
        LANDRegistry _landRegistry,
        address _dex
    ) public {
        Ownable.initialize(msg.sender);

        require(
            address(_landRegistry).isContract(),
            "The LANDRegistry token address must be a deployed contract"
        );
        landRegistry = _landRegistry;

        setDex(_dex);

        allowToken(address(_manaToken), 18, true);
        manaToken = _manaToken;

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
    ) external whenNotPaused 
    {
        validateBidParameters(
            _xs, 
            _ys, 
            _beneficiary, 
            _fromToken
        );

        uint256 currentPrice = getCurrentPrice();
        uint256 totalPrice = _xs.length.mul(currentPrice);
        
        if (address(_fromToken) != address(manaToken)) {
            require(
                address(dex).isContract(), 
                "Pay with other token than MANA is not available"
            );
            // Convert _fromToken to MANA
            totalPrice = convertSafe(totalBids, _fromToken, totalPrice);
        } else {
            // Transfer MANA to LANDAuction contract
            require(
                _fromToken.transferFrom(msg.sender, address(this), totalPrice),
                "Transfering the totalPrice to LANDAuction contract failed"
            );
        }

        // Assign LANDs to _beneficiary
        for (uint i = 0; i < _xs.length; i++) {
            require(
                -150 <= _xs[i] && _xs[i] <= 150 && -150 <= _ys[i] && _ys[i] <= 150,
                "The coordinates should be inside bounds -150 & 150"
            );
        }
        landRegistry.assignMultipleParcels(_xs, _ys, _beneficiary);

        emit BidSuccessful(
            totalBids,
            _beneficiary,
            _fromToken,
            currentPrice,
            totalPrice,
            _xs,
            _ys
        );  

        // Increase bids count
        totalBids++;
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

    /**
    * @dev Convert allowed token to MANA and transfer the change in MANA to the sender
    * Note that we will use the slippageRate cause it has a 3% buffer
    * @param _fromToken - ERC20 token to be converted
    * @param _totalPrice - uint256 of the total amount in MANA
    * @return uint256 of the total amount of MANA
    */
    function convertSafe(
        uint256 bidId,
        ERC20 _fromToken,
        uint256 _totalPrice
    ) internal returns (uint256 totalPrice)
    {
        totalPrice = _totalPrice;
        // Save the current MANA balance of the contract
        uint256 prevBalance = manaToken.balanceOf(address(this));

        // Get rate
        uint256 tokenRate;
        (, tokenRate) = dex.getExpectedRate(manaToken, _fromToken, totalPrice);

        // Calculate the amount of _fromToken needed
        uint256 totalPriceInToken = totalPrice.mul(tokenRate).div(10 ** 18);

        // Normalize to _fromToken decimals and calculate the amount of tokens to convert
        Token memory fromToken = tokensAllowed[address(_fromToken)];
        if (MAX_DECIMALS > fromToken.decimals) {
           
            uint256 priceInToken = totalPriceInToken.div(10**(MAX_DECIMALS - fromToken.decimals));

            // Solidity always truncate the result. if division has a remainder, we should
            // increase 1 wei to ensure the price in MANA 
            if (totalPriceInToken.mod(10**(MAX_DECIMALS - fromToken.decimals)) > 0) {
                totalPriceInToken = priceInToken.add(1);
            } else {
                totalPriceInToken = priceInToken;
            }
        }

        // Transfer _fromToken amount from sender to the contract
        require(
            _fromToken.transferFrom(msg.sender, address(this), totalPriceInToken),
            "Transfering the totalPrice in token to LANDAuction contract failed"
        );

        // Check if contract should keep a percentage of _fromToken
        uint256 tokensKept = 0;
        if (fromToken.shouldKeepToken) {
            // Should keep a percentage of the token
            // PERCENTAGE_OF_TOKEN_TO_KEEP will always be less than 100
            tokensKept = totalPriceInToken.mul(PERCENTAGE_OF_TOKEN_TO_KEEP).div(100);
            totalPrice = totalPrice.mul(100 - PERCENTAGE_OF_TOKEN_TO_KEEP).div(100);
        }
        
        // Approve amount of _fromToken owned by contract to be used by dex contract
        require(_fromToken.approve(address(dex), totalPriceInToken), "Error approve");

        // Convert _fromToken to MANA
        uint256 bought = dex.convert(
                _fromToken,
                manaToken,
                totalPriceInToken - tokensKept,
                totalPrice
            );
        
        // Check the amount of MANA bought
        require(
            manaToken.balanceOf(address(this)).sub(prevBalance) >= bought,
            "Bought amount incorrect"
        );

       // Return change in MANA to sender
        if (bought > totalPrice) {
            uint256 change = bought.sub(totalPrice);
            require(
                manaToken.transfer(msg.sender, change),
                "Transfering the change to sender failed"
            );
        }

        // Remove approval of _fromToken owned by contract to be used by dex contract
        require(_fromToken.approve(address(dex), 0), "Error remove approval");

        emit BidConvertion(
            bidId,
            address(_fromToken),
            totalPrice,
            totalPriceInToken,
            tokensKept
        );
    }

    /** 
    * @dev Validate bid function params
    * @param _xs - uint256[] x values for the LANDs to bid
    * @param _ys - uint256[] y values for the LANDs to bid
    * @param _beneficiary - address beneficiary for the LANDs to bid
    * @param _fromToken - token used to bid
    */
    function validateBidParameters(
        int[] _xs, 
        int[] _ys, 
        address _beneficiary, 
        ERC20 _fromToken
    ) internal view 
    {
        require(status == Status.started, "The auction was not started");
        require(block.timestamp - startedTime <= duration, "The auction has finished");
        require(tx.gasprice <= gasPriceLimit, "Gas price limit exceeded");
        require(_beneficiary != address(0), "The beneficiary could not be 0 address");
        require(_xs.length > 0, "You should bid to at least one LAND");
        require(_xs.length <= landsLimitPerBid, "LAND limit exceeded");
        require(_xs.length == _ys.length, "X values length should be equal to Y values length");
        require(tokensAllowed[address(_fromToken)].isAllowed, "Token not allowed");
    }
}