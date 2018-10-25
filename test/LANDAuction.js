import assertRevert from 'openzeppelin-eth/test/helpers/assertRevert'
import { increaseTime, duration } from './helpers/increaseTime'

const BigNumber = web3.BigNumber
require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const LANDAuction = artifacts.require('LANDAuction')
const ERC20Token = artifacts.require('ERC20Test')
const AssetRegistryToken = artifacts.require('AssetRegistryTest')

const AUCTION_STATUS_OP_CODES = {
  created: 0,
  started: 1,
  finished: 2
}

function getEndTime(daysAhead = 15) {
  return web3.eth.getBlock('latest').timestamp + duration.days(daysAhead)
}

contract('LANDAuction', function([_, owner, bidder, anotherBidder, hacker]) {
  const startPrice = web3.toWei(200.0, 'ether')
  const endPrice = web3.toWei(100.0, 'ether')
  const auctionDuration = duration.days(15)
  const zeroAddress = '0x0000000000000000000000000000000000000000'

  let landAuction
  let manaToken
  let landRegistry

  let endTime

  const fromOwner = {
    from: owner
  }

  const fromBidder = {
    from: bidder
  }

  const fromAnotherBidder = {
    from: anotherBidder
  }

  const creationParams = {
    ...fromOwner,
    gas: 6e6,
    gasPrice: 21e9
  }

  beforeEach(async function() {
    // Create tokens
    manaToken = await ERC20Token.new(creationParams)
    landRegistry = await AssetRegistryToken.new(creationParams)

    // Create a LANDAuction
    landAuction = await LANDAuction.new(
      startPrice,
      endPrice,
      auctionDuration,
      manaToken.address,
      landRegistry.address,
      {
        from: owner
      }
    )

    // Assign balance to bidders and allow LANDAuction to move MANA
    await manaToken.setBalance(web3.toWei(10, 'ether'), fromBidder)
    await manaToken.setBalance(web3.toWei(10, 'ether'), fromAnotherBidder)
    await manaToken.approve(landAuction.address, 1e30, fromBidder)
    await manaToken.approve(landAuction.address, 1e30, fromAnotherBidder)

    endTime = getEndTime()
  })

  describe('Constructor', function() {
    it('should instanciate with correct values', async function() {
      const _landAuction = await LANDAuction.new(
        startPrice,
        endPrice,
        auctionDuration,
        manaToken.address,
        landRegistry.address,
        {
          from: owner
        }
      )
      const currentLANDPrice = await _landAuction.getCurrentLANDPrice()
      currentLANDPrice.should.be.bignumber.equal(startPrice)

      const status = await _landAuction.status()
      status.should.be.bignumber.equal(AUCTION_STATUS_OP_CODES.created)
    })
  })
})
