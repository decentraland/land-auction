pragma solidity ^0.4.24;

import "contracts/dex/IKyberNetwork.sol";

contract KyberMock is IKyberNetwork {

    function trade(
        IERC20 _fromToken,
        uint _fromAmount,
        IERC20 _toToken,
        address destAddress,
        uint _maxFromAmount,
        uint _minConversionRate,
        address _walletId
    ) public payable returns(uint) {
        return 1;
    }

    function getExpectedRate(IERC20 _fromToken, IERC20 _toToken, uint _fromAmount) 
        public view returns(uint expectedRate, uint slippageRate) {
        (expectedRate, slippageRate) = (2, 3);
    }
}