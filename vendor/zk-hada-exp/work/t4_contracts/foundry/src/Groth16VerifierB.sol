// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16VerifierB {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 7579219359731908955484221961087662412514158355875319774919299430229938833203;
    uint256 constant alphay  = 13463114755457445450509165589927549893433081059136879750053469339540709669624;
    uint256 constant betax1  = 16349540763420059315116142144557235793194630465226188443562380413343897062067;
    uint256 constant betax2  = 21779903656349638471093361674276940080123821271352824239832743887933895045854;
    uint256 constant betay1  = 9433415275642148815346587543989078579725812487008619957480950023913074585840;
    uint256 constant betay2  = 15548991042145836648949982870411786503972769578606071661039921904453221030191;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 7880093895576323462279191273833369161787847612805373678941156886746996637639;
    uint256 constant deltax2 = 19903214434752382100095372687932814453270076744799140607034914618911876246146;
    uint256 constant deltay1 = 4514538979526103746097080591784848760982304654000592509902348571504624115365;
    uint256 constant deltay2 = 18893795609150695684320076379144920599872073742507048937362719978725716562284;

    
    uint256 constant IC0x = 7684201492745782071112627991970914533522306589872828158399234210947236191524;
    uint256 constant IC0y = 8026228490288834506060583183197748633486685533394627761146019145641601416314;
    
    uint256 constant IC1x = 12774748177041741358044194337869470015255155725114921691512257309002155081245;
    uint256 constant IC1y = 16936534827935292808585425444282035370812836264133438009334909520442481108959;
    
    uint256 constant IC2x = 3734614291550582818650692108417458690233568917246056835303574319063409896662;
    uint256 constant IC2y = 4056510342906277592726828632354059467644405907874153832189140077740138429967;
    
    uint256 constant IC3x = 11872458179414663087275350770198980869324551683479636052024442317482901884437;
    uint256 constant IC3y = 15766182223851828860084954859827334037849181551320878546674659928786101414209;
    
    uint256 constant IC4x = 14336983000695417070548172688675642110814623778768270730266725609151718986873;
    uint256 constant IC4y = 12123784461662166319027176531237725288586031255916408782491226595059957601835;
    
    uint256 constant IC5x = 5015797164858869092034237799792394575984600156974547130717911466426513621482;
    uint256 constant IC5y = 13742165325056816308989725713983155950203550504109363865919740951146786198846;
    
    uint256 constant IC6x = 3877940129386450779169720266348287946833924204907880824919366660154436345788;
    uint256 constant IC6y = 13049061431240008256290302152603011412264054414931251975011870807119152608445;
    
    uint256 constant IC7x = 3550144650218043237712382746718024507980638934477865651763988749115149984540;
    uint256 constant IC7y = 7379980669948903552382694258694306527421952213053940450604871463606656103719;
    
    uint256 constant IC8x = 20776530527983641169371255183972081658590716790959411456509853712131187098894;
    uint256 constant IC8y = 14207242555607847775882061545621835943428055127742325090419724222899628112081;
    
    uint256 constant IC9x = 3210987133580840123024395119135291005697175797320271067129453659793679830889;
    uint256 constant IC9y = 6314104256761735413590761972675182907244436113924189057899738116808461809871;
    
    uint256 constant IC10x = 18477021439141087244150011275672448909239177196703210627370166685431134889993;
    uint256 constant IC10y = 11361368873872981779411109808253500148756322136635275413527116622675540611644;
    
    uint256 constant IC11x = 6979206662520764085993345277567457749986740161740582762131279035510406165436;
    uint256 constant IC11y = 3479291310145996118899871244028969339718946831391819880773159896242004810777;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[11] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
