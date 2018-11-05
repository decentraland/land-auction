pragma solidity ^0.4.24;

import "openzeppelin-eth/contracts/token/ERC20/IERC20.sol";


contract IKyberNetwork {
    function trade(
        IERC20 _fromToken,
        uint _fromAmount,
        IERC20 _toToken,
        address _destAddress, 
        uint _maxFromAmount,	
        uint _minConversionRate,	
        address _walletId
        ) 
        public payable returns(uint);

    function getExpectedRate(IERC20 _fromToken, IERC20 _toToken, uint _fromAmount) 
        public view returns(uint expectedRate, uint slippageRate);
}