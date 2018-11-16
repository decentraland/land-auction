#! /bin/bash

LAND_AUCTION=LANDAuction.sol
KYBER_CONVERTER=KyberConverter.sol

OUTPUT=full

npx truffle-flattener contracts/auction/$LAND_AUCTION > $OUTPUT/$LAND_AUCTION
npx truffle-flattener contracts/dex/$KYBER_CONVERTER > $OUTPUT/$KYBER_CONVERTER

