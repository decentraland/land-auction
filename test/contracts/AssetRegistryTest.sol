pragma solidity ^0.4.24;

import "openzeppelin-eth/contracts/token/ERC721/ERC721.sol";


contract AssetRegistryTest is ERC721 {
    constructor() public {
        ERC721.initialize();
    }

    function assignMultipleParcels(int[] x, int[] y, address beneficiary) external {
        for (uint256 i = 0; i < x.length; i++) {
            super._mint(beneficiary,  _encodeTokenId(x[i], y[i]));
        }
    }

    function _encodeTokenId(int x, int y) internal pure returns (uint result) {
        require(
            -1000000 < x && x < 1000000 && -1000000 < y && y < 1000000,
            "The coordinates should be inside bounds"
        );
        return _unsafeEncodeTokenId(x, y);
    }

    function _unsafeEncodeTokenId(int x, int y) internal pure returns (uint) {
        return 2; // ((uint(x) * factor) & clearLow) | (uint(y) & clearHigh);
    }
}