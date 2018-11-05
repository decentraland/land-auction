pragma solidity ^0.4.24;

import "./ITokenConverter.sol";
import "./IKyberNetwork.sol";


/**
* @dev Contract to encapsulate Kyber methods which implements ITokenConverter.
* Note that need to create it with a valid kyber address
*/
contract KyberConverter is ITokenConverter {
    IKyberNetwork internal  kyber;
    uint256 private constant MAX_UINT = uint256(0) - 1;
    address internal walletId;

    constructor (IKyberNetwork _kyber, address _walletId) public {
        kyber = _kyber;
        walletId = _walletId;
    }
 
    function getReturn(IERC20 _fromToken, IERC20 _toToken, uint256 _fromAmount) 
    external view returns (uint256 amount) 
    {
        uint256 rate;
        (rate, ) = getExpectedRate(_fromToken, _toToken, _fromAmount);
        amount = _fromAmount.mul(rate).div(10 ** 18);
    }
    
    function convert(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount,
        uint256 _minReturn) 
    external payable returns (uint256 amount) 
    {
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
        // Trade _fromAmount from _fromToken to _toToken
        amount = kyber.trade(
            _fromToken,
            _fromAmount,
            _toToken,
            address(this),
            MAX_UINT,
            _minReturn,
            walletId
        );
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

    function getExpectedRate(IERC20 _fromToken, IERC20 _toToken, uint256 _fromAmount) 
    public view returns(uint256 expectedRate, uint256 slippageRate) 
    {
        (expectedRate, slippageRate) = kyber.getExpectedRate(_fromToken, _toToken, _fromAmount);
    }
}