pragma solidity ^0.4.24;

import "./ITokenConverter.sol";
import "./IKyberNetwork.sol";

contract KyberConverter is ITokenConverter {
    IKyberNetwork internal  kyber;
    uint256 private constant MAX_UINT = uint256(0) - 1;

    constructor (IKyberNetwork _kyber) public {
        kyber = _kyber;
    }

    function getExpectedRate(IERC20 _fromToken, IERC20 _toToken, uint _fromAmount) public view returns(uint expectedRate, uint slippageRate) {
        (expectedRate, slippageRate) = kyber.getExpectedRate(_fromToken, _toToken, _fromAmount);
    }
    
    function getReturn(IERC20 _fromToken, IERC20 _toToken, uint256 _fromAmount) external view returns (uint256 amount) {
        (amount,) = getExpectedRate(_fromToken, _toToken, _fromAmount);
    }
    
    function convert(IERC20 _fromToken, IERC20 _toToken, uint256 _fromAmount, uint256 _minReturn) external payable returns (uint256 amount) {
        // Transfer tokens to be converted from msg.sender to this contract
        require(
            _fromToken.transferFrom(msg.sender, address(this), _fromAmount),
            "Could not transfer _fromToken to this contract"
        );
        // Approve Kyber to use _fromToken on belhalf of this contract
        require(
            _fromToken.approve(kyber, _fromAmount),
            "Could not approve kyber to use _fromToken on behalf of this contract"
        );
        // Trade _fromAmount from _fromToken to _toToken with a max
        amount = kyber.trade(_fromToken, _fromAmount, _toToken, address(this), MAX_UINT, 1, 0x0);
        // Clean kyber to use _fromTokens on belhalf of this contract
        require(
            _fromToken.approve(kyber, 0),
            "Could not clean approval of kyber to use _fromToken on behalf of this contract"
        );
        // Check if the amount traded is greater or equal to the minimum required
        require(amount >= _minReturn, "Min return not reached");
        // Transfer amount of _toTokens to msf.sender
        require(
            _toToken.transfer(msg.sender, amount),
            "Could not transfer amount of _toToken to msg.sender"
        );
    }
}