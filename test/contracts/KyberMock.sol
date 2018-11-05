pragma solidity ^0.4.24;

import "contracts/dex/IKyberNetwork.sol";

contract KyberMock is IKyberNetwork {
    uint256 constant public rate_NCH_MANA = 1262385660474240000; // 1.262 - 18 decimals
    uint256 constant public rate_DCL_MANA = 2562385660474240000; // 2.562 - 18 decimals
    uint256 public rate_MANA_NCH = 792150949832820000; // 100 / rate_NCH_MANA
    uint256 public rate_MANA_DCL = 3902613160170911; // 100 / rate_DCL_MANA

    address public nchToken;
    address public dclToken;

    constructor(address _nchToken, address _dclToken) public {
        nchToken = _nchToken;
        dclToken = _dclToken;
    }

    function trade(
        IERC20 _fromToken,
        uint _fromAmount,
        IERC20 _toToken,
        address _destAddress, 
        uint /* _maxFromAmount */,	
        uint _minConversionRate,	
        address /* _walletId */
    ) public payable returns(uint256) {
        uint256 rate;
        (rate, ) = getExpectedRate(_toToken, _fromToken, _fromAmount);
        require(rate > _minConversionRate, "Rate is to low");
        require(_fromToken.transferFrom(msg.sender, this, _fromAmount), "Could not transfer");
        uint256 destAmount = convertRate(_fromAmount, rate);
        require(_toToken.transfer(_destAddress, destAmount), "Could not transfer");
        return destAmount;
    }

    function convertRate(uint256 amount, uint256 rate) internal pure returns (uint256) {
        return (amount * rate) / 10**18;
    }

    function getExpectedRate(IERC20 _fromToken, IERC20 _toToken, uint256 /* _fromAmount */) 
        public view returns(uint256, uint256) {
        if (_fromToken == nchToken) {
            return (rate_NCH_MANA, rate_NCH_MANA);
        } else if (_fromToken == dclToken) {
            return (rate_DCL_MANA, rate_DCL_MANA);
        } else if (_toToken == nchToken) {
            return (rate_MANA_NCH, rate_MANA_NCH);
        } else if (_toToken == dclToken) {
            return (rate_MANA_DCL, rate_MANA_DCL);
        }
        revert("invalid rate");
    }
}