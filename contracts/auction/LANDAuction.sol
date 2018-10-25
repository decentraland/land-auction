pragma solidity ^0.4.24;

import "openzeppelin-eth/contracts/ownership/Ownable.sol";
import "openzeppelin-eth/contracts/lifecycle/Pausable.sol";
import "openzeppelin-eth/contracts/math/SafeMath.sol";
import "openzeppelin-eth/contracts/utils/Address.sol";

import "./LANDAuctionStorage.sol";

contract LANDAuction is Ownable, Pausable, LANDAuctionStorage{
    using SafeMath for uint256;
    using Address for address;

    /**
    * @dev Constructor of the contract
    * @param _startPrice - LAND starting price
    * @param _endPrice - LAND end price
    * @param _duration - duration of the auction in miliseconds
    */
    constructor(uint256 _startPrice, uint256 _endPrice, uint256 _duration, address _manaToken, address _landRegistry) public {
        require(_manaToken.isContract(), "The mana token address must be a deployed contract");
        manaToken = MANAToken(_manaToken);

        require(_landRegistry.isContract(), "The LANDRegistry token address must be a deployed contract");
        landRegistry = LANDRegistry(_landRegistry);

        require(_startPrice > 0, "The starting price should be greater than 0");
        require(_startPrice > _endPrice, "The start price should be greater than end price");
        require(_duration > 24 * 60 * 60, "The duration should be greater than 1 day");

        
        duration = _duration;
        startPrice = _startPrice;
        endPrice = _endPrice;

        require(
            endPrice == _getPrice(duration),
            "The end price defined should be achieved when auction ends"
        );

        status = Status.created;

        Ownable.initialize(msg.sender);
        Pausable.initialize(msg.sender);
    }

    /**
    * @dev Start the auction
    */
    function startAuction() external onlyOwner {
        require(status == Status.created, "The auction was started");
        startTimestamp = block.timestamp;
       
        status = Status.started;
    }

    /**
    * @dev Returns price based on time
    * It is a linear function y = ax - b. But The slope should be negative.
    * Based on two points (startPrice; startedTime = 0) and (endPrice; endTime = duration)
    * slope = (endPrice - startedPrice) / (duration - startedTime)
    * As Solidity does not support negative number we use it as: y = b - ax
    * @param _time - Time passed before reach duration
    */
    function _getPrice(uint256 _time) public view returns (uint256) {
        require(_time <= duration, "Invalid time");
        return  startPrice.sub(startPrice.sub(endPrice).mul(_time).div(duration));
    }

    /**
    * @dev Returns the current price of the LAND. If the auction was not started
    * returns started price
    */
    function getCurrentLANDPrice() public view returns (uint256) { 
        if (startTimestamp == 0) {
            return _getPrice(0);
        } else {
            uint256 timePassed = block.timestamp - startTimestamp;
            return _getPrice(timePassed);
        }
    }

    function bid(uint256[] _xs, uint256[] _ys) external whenNotPaused {
        require(status == Status.started, "The auction was not started");
        require(_xs.length > 0, "You should bid to at least one LAND");
        require(_xs.length > _ys.length, "You should bid valid LANDs");

        uint256 amount = _xs.length;
        uint256 currentPrice = getCurrentLANDPrice();
        uint256 totalPrice = amount.mul(currentPrice);

        // Transfer MANA to LANDAuction contract
        require(
            manaToken.transferFrom(msg.sender, address(this), totalPrice),
            "Transfering the totalPrice to LANDAuction contract failed"
        );

        // @nacho TODO: allow LANDAuction to assign parcels
        // landRegistry.assignMultipleParcels(_xs, _ys, msg.sender);
    }

    /**
    * @dev Burn the MANA earned by the auction
    */
    function burnFunds() external onlyOwner {
        require(
            status == Status.finished,
            "Burn should be performed when the auction is finished"
        );
        uint256 balance = manaToken.balanceOf(address(this));
        manaToken.burn(balance);
    }

    function pause() public onlyOwner whenNotPaused{
        status = Status.finished;
        super.pause();
    }

}