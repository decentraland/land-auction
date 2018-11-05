pragma solidity ^0.4.24;

import "openzeppelin-eth/contracts/token/ERC20/IERC20.sol";

contract IKyberNetwork {
    function swapTokenToToken(
        IERC20 _fromToken,
        uint _fromAmount,
        IERC20 _toToken,
        uint _minConversionRate) 
        public payable returns(uint);

    function getExpectedRate(IERC20 _fromToken, IERC20 _toToken, uint _fromAmount) 
        public view returns(uint expectedRate, uint slippageRate);
}