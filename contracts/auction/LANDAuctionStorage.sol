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
    function ownerOfLand(uint256 x, uint256 y) external view returns (address);
    function assignMultipleParcels(uint256[] x, uint256[] y, address beneficiary) external;
    function supportsInterface(bytes4) public view returns (bool);
}

contract LANDAuctionStorage {
    enum Status { created, started, finished }

    Status public status;

    uint256 internal initialPrice;
    uint256 internal endPrice;
    uint256 internal startedTime;
    uint256 internal duration;

    uint256 public gasPriceLimit;
    uint256 public landsLimit;
    MANAToken public manaToken;
    LANDRegistry public landRegistry;

    event AuctionCreated(
      address indexed _caller,
      uint256 _initialPrice,
      uint256 _endPrice,
      uint256 _duration
    );

    event AuctionStarted(
      address indexed _caller,
      uint256 _time
    );

    event BidSuccessful(
      address indexed _beneficiary,
      uint256 _price,
      uint256 _totalPrice,
      uint256[] _xs,
      uint256[] _ys
    );

    event AuctionEnd(
      address _caller,
      uint256 _price
    );

    event MANABurned(
      address indexed _caller,
      uint256 _total
    );

    event LandsLimitChanged(
      uint256 _oldLandsLimit, 
      uint256 _landsLimit
    );

    event GasPriceLimitChanged(
      uint256 _oldGasPriceLimit,
      uint256 _gasPriceLimit
    );
}