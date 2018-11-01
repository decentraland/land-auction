pragma solidity ^0.4.24;

<<<<<<< HEAD
=======
import "../dex/ITokenConverter.sol";
>>>>>>> feat: kyber dex

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
    function assignMultipleParcels(int[] x, int[] y, address beneficiary) external;
}


contract LANDAuctionStorage {
    bytes4 public constant ACEPTED_ERC20 = 0x34;
    enum Status { created, started, finished }

    Status public status;
    uint256 public gasPriceLimit;
    uint256 public landsLimitPerBid;
    MANAToken public manaToken;
    LANDRegistry public landRegistry;

    uint256 internal initialPrice;
    uint256 internal endPrice;
    uint256 internal startedTime;
    uint256 internal duration;
    ITokenConverter internal dex;

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
      int[] _xs,
      int[] _ys
    );

    event AuctionEnded(
      address indexed _caller,
      uint256 _time,
      uint256 _price
    );

    event MANABurned(
      address indexed _caller,
      uint256 _total
    );

    event LandsLimitPerBidChanged(
      address indexed _caller,
      uint256 _oldLandsLimitPerBid, 
      uint256 _landsLimitPerBid
    );

    event GasPriceLimitChanged(
      address indexed _caller,
      uint256 _oldGasPriceLimit,
      uint256 _gasPriceLimit
    );

    event DexChanged(
      address indexed _caller,
      address _oldDex,
      address _dex
    );
}