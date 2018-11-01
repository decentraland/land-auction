pragma solidity ^0.4.24;

import "openzeppelin-eth/contracts/token/ERC20/IERC20.sol";

contract ITokenConverter {
    address public constant ETH_ADDRESS = 0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee;
    function getExpectedRate(IERC20 _fromToken, IERC20 _toToken, uint _fromAmount) 
        public view returns(uint expectedRate, uint slippageRate);
    function getReturn(IERC20 _fromToken, IERC20 _toToken, uint256 _fromAmount) 
        external view returns (uint256 amount);
    function convert(IERC20 _fromToken, IERC20 _toToken, uint256 _fromAmount, uint256 _minReturn) 
        external payable returns (uint256 amount);
}