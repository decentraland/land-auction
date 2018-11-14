pragma solidity ^0.4.24;

import "../../contracts/auction/LANDAuction.sol";

contract LANDAuctionTest is LANDAuction {
    constructor(
        uint256[] _xPoints, 
        uint256[] _yPoints, 
        ERC20 _manaToken, 
        LANDRegistry _landRegistry,
        address _dex
    ) public LANDAuction(_xPoints, _yPoints, _manaToken, _landRegistry, _dex) {
    }

    function getPrice(uint256 _value) public view returns (uint256) {
        if (startedTime == 0) {
            return initialPrice;
        } else {
            if (_value >= duration) {
                return endPrice;
            }
            return _getPrice(_value);
        }
    }
}