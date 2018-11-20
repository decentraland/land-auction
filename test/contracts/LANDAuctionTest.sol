pragma solidity ^0.4.24;

import "../../contracts/auction/LANDAuction.sol";


contract LANDAuctionTest is LANDAuction {
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
    ) public LANDAuction(
        _xPoints, 
        _yPoints, 
        _manaToken,
        _daiToken,
        _landRegistry, 
        _dex, 
        _daiCharity,
        _tokenKiller
    ) {}

    function getPrice(uint256 _value) public view returns (uint256) {
        if (startTime == 0) {
            return initialPrice;
        } else {
            if (_value >= duration) {
                return endPrice;
            }
            return _getPrice(_value);
        }
    }
}