pragma solidity ^0.4.24;

import "openzeppelin-eth/contracts/ownership/Ownable.sol";
import "openzeppelin-eth/contracts/lifecycle/Pausable.sol";
import "openzeppelin-eth/contracts/math/SafeMath.sol";
import "openzeppelin-eth/contracts/utils/Address.sol";

import "./LANDAuctionStorage.sol";

contract LANDAuction is Ownable, Pausable, LANDAuctionStorage {
    using SafeMath for uint256;
    using Address for address;

    /**
    * @dev Constructor of the contract
    * @param _initialPrice - uint256 initial LAND price
    * @param _endPrice - uint256 end LAND price
    * @param _duration - uint256 duration of the auction in miliseconds
    */
    constructor(uint256 _initialPrice, uint256 _endPrice, uint256 _duration, address _manaToken, address _landRegistry) public {
        require(_manaToken.isContract(), "The mana token address must be a deployed contract");
        manaToken = MANAToken(_manaToken);

        require(_landRegistry.isContract(), "The LANDRegistry token address must be a deployed contract");
        landRegistry = LANDRegistry(_landRegistry);

        require(_initialPrice > 0, "The initial price should be greater than 0");
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
        Pausable.initialize(msg.sender);

        emit AuctionCreated(msg.sender, initialPrice, endPrice, duration);
    }

    /**
    * @dev Start the auction
    * @param _landsLimit - uint256 LANDs limit for a single id
    * @param _gasPriceLimit - uint256 gas price limit for a single bid
    */
    function startAuction(uint256 _landsLimit, uint256 _gasPriceLimit) external onlyOwner whenNotPaused {
        require(status == Status.created, "The auction was started");

        setLandsLimit(_landsLimit);
        setGasPriceLimit(_gasPriceLimit);

        startedTime = block.timestamp;
        status = Status.started;

        emit AuctionStarted(msg.sender, startedTime);
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
        if (_time > duration) {
            return endPrice;
        }
        return  initialPrice.sub(initialPrice.sub(endPrice).mul(_time).div(duration));
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
    */
    function bid(uint256[] _xs, uint256[] _ys, address _beneficiary) external whenNotPaused {
        require(status == Status.started, "The auction was not started");
        require(tx.gasprice <= gasPriceLimit, "Gas price limit exceeded");
        require(_beneficiary != address(0), "The beneficiary could not be 0 address");
        require(_xs.length > 0, "You should bid to at least one LAND");
        require(_xs.length <= landsLimit, "LAND limit exceeded");
        require(_xs.length == _ys.length, "X values length should be equal to Y values length");

        uint256 amount = _xs.length;
        uint256 currentPrice = getCurrentPrice();
        uint256 totalPrice = amount.mul(currentPrice);

        // Transfer MANA to LANDAuction contract
        require(
            manaToken.transferFrom(msg.sender, address(this), totalPrice),
            "Transfering the totalPrice to LANDAuction contract failed"
        );

        // @nacho TODO: allow LANDAuction to assign LANDs
        // Assign LANDs to _beneficiary
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
    * @dev pause auction 
    */
    function pause() public onlyOwner whenNotPaused {
        finishAuction();
    }

    /**
    * @dev Finish auction 
    */
    function finishAuction() public onlyOwner whenNotPaused {
        status = Status.finished;
        super.pause();

        uint256 currentPrice = getCurrentPrice();
        emit AuctionEnd(msg.sender, currentPrice);
    }

    /**
    * @dev Set LANDs limit for the auction
    * @param _landsLimit - uint256 LANDs limit for a single id
    */
    function setLandsLimit(uint256 _landsLimit) public onlyOwner {
        require(_landsLimit > 0, "The lands limit should be greater than 0");
        emit LandsLimitChanged(landsLimit, _landsLimit);
        landsLimit = _landsLimit;
    }

    /**
    * @dev Set gas price limit for the auction
    * @param _gasPriceLimit - uint256 gas price limit for a single bid
    */
    function setGasPriceLimit(uint256 _gasPriceLimit) public onlyOwner {
        require(_gasPriceLimit > 0, "The gas price should be greater than 0");
        emit GasPriceLimitChanged(gasPriceLimit, _gasPriceLimit);
        gasPriceLimit = _gasPriceLimit;
    }
}