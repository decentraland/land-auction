pragma solidity ^0.4.24;

import "openzeppelin-eth/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-eth/contracts/math/SafeMath.sol";


contract ITokenConverter {    
    using SafeMath for uint256;

    /**
    * @dev Makes a simple ERC20 -> ERC20 token trade
    * @param _fromToken - IERC20 token
    * @param _toToken - IERC20 token 
    * @param _fromAmount - uint256 amount to be converted
    * @param _minReturn - uint256 mininum amount to be returned
    * @return uin2556 of the amount after convertion
    */
    function convert(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount,
        uint256 _minReturn
        ) external payable returns (uint256 amount);

    /**
    * @dev Get exchange rate and slippage rate. 
    * Note that these returned values are in 18 decimals regardless of the destination token's decimals.
    * @param _fromToken - IERC20 token
    * @param _toToken - IERC20 token 
    * @param _fromAmount - uint256 amount to be converted
    * @return uint256 of the expected rate
    * @return uint256 of the slippage rate
    */
    function getExpectedRate(IERC20 _fromToken, IERC20 _toToken, uint256 _fromAmount) 
        public view returns(uint256 expectedRate, uint256 slippageRate);
}