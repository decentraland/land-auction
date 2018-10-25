pragma solidity ^0.4.24;

/**
* @title Interface for MANA token conforming to ERC-20
*/
contract MANAToken {
    function balanceOf(address who) public view returns (uint256);
    function burn(uint256 _value) public;
    function transferFrom(address from, address to, uint tokens) public returns (bool success);
}

/**
* @title Interface for contracts conforming to ERC-721
*/
contract LANDRegistry {
    function ownerOfLand(int x, int y) external view returns (address);
    function assignMultipleParcels(int[] x, int[] y, address beneficiary) external;
    function supportsInterface(bytes4) public view returns (bool);
}

contract LANDAuctionStorage {
    enum Status { created, started, finished }

    Status public status;

    uint256 internal startPrice;
    uint256 internal endPrice;
    uint256 internal startTimestamp;
    uint256 internal duration;

    MANAToken internal manaToken;
    LANDRegistry internal landRegistry;

    event BidSuccessful(
      address indexed beneficiary,
      uint256 price,
      uint256[] xs,
      uint256[] ys
    );

    event AuctionStarted(
      uint256 time,
      uint256 price
    );

    event AuctionEnd(
      uint256 time,
      uint256 price
    );

    event MANABurned(
      address caller,
      uint256 total
    );
}