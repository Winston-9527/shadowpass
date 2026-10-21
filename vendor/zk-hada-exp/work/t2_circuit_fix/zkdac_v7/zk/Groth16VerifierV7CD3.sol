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

contract Groth16VerifierV7CD3 {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 13447717875484961744669861813747146568059308211174150796848425123119918046754;
    uint256 constant deltax2 = 330170537468545781577670486001550448423294118310102767873377562280227380270;
    uint256 constant deltay1 = 6694337857602029170921792253125502590355689153375762379585616914810486266304;
    uint256 constant deltay2 = 14455273967007218208460238230699477660041450426791515502462528223937536427368;

    
    uint256 constant IC0x = 1646833358613189101387267373488967799847656632128398063595833957037463406372;
    uint256 constant IC0y = 16390557186336029951077784513739059378923695441448987297290879384953202345134;
    
    uint256 constant IC1x = 18730905879500158467514036967303556935758099132523658030899597292611117977196;
    uint256 constant IC1y = 6945563917902544028445721060508587933347549826083152001387878089621550642635;
    
    uint256 constant IC2x = 4036625986292951704329127957678263753948091591082721895795719099360973223640;
    uint256 constant IC2y = 16406559587100910122418694991171858570449540637491192930359761996034296125349;
    
    uint256 constant IC3x = 11475520998839433411094666610427869804982817435872256482567737397192513689729;
    uint256 constant IC3y = 6389082569009915980163673512625141876991448571732479463016508410544741579263;
    
    uint256 constant IC4x = 11821978389185511413783729535717868501075644549005393720830176083133990678435;
    uint256 constant IC4y = 2269625609891476323667534836776676609716675346588988533938759911207575492099;
    
    uint256 constant IC5x = 9593101301712588057422972343064516177400888768764184371321854242327804592789;
    uint256 constant IC5y = 9269401120585160501160480120142657578318234878510584580618428344149198348627;
    
    uint256 constant IC6x = 3658780688913047507370929428201502660231311972063812465261822489975219889960;
    uint256 constant IC6y = 14389954122358272768259352172657168794528294859218031987958629396076697545650;
    
    uint256 constant IC7x = 11249978436014519315266802294616797966079848769531822922814260467354755145499;
    uint256 constant IC7y = 17807936492570780394519549409851361556989800487347691761661289310428646823067;
    
    uint256 constant IC8x = 1622836572031788293974292592068851609091852498093496539660598616181430845082;
    uint256 constant IC8y = 21542877290635403654961032701166581591515420051755164694800595169045528417196;
    
    uint256 constant IC9x = 6114214930035922363175382831793431957211898026328277150952642296048331016040;
    uint256 constant IC9y = 4613077771477178337293144680274323340495274641123093824694813249866158364276;
    
    uint256 constant IC10x = 20762459438703681339599080444632156919521125917371567169140719319374364271671;
    uint256 constant IC10y = 528360070943660578562995855848504491614975216564279712008088141396457362795;
    
    uint256 constant IC11x = 6357875357100211332365702619491617627064238392868968419398693059618931736207;
    uint256 constant IC11y = 9890141956534639623402269492238347060717258016340476951882529083356835478288;
    
    uint256 constant IC12x = 3843244579741508368156365358357266327536662471221594647907220418789494936396;
    uint256 constant IC12y = 8049854804283217617522774953412691042325795987805232514768029788751721056095;
    
    uint256 constant IC13x = 10099216349931515706537187213003520345557118693225572915649949055413194472041;
    uint256 constant IC13y = 16916575880756628458517166353417344780240102271688689456542155759012952864315;
    
    uint256 constant IC14x = 15647675826987892331055312117609982483061108060586030083238829261103170382413;
    uint256 constant IC14y = 10895694541711377276853150463840064101530128824212726913005015947386750550476;
    
    uint256 constant IC15x = 16954795264404914129869043017248189145994194073453038590967430893530754294576;
    uint256 constant IC15y = 17166147175544528350872233278521931373676926770263757039449073302224362239692;
    
    uint256 constant IC16x = 1190141407079197010567266020194146444675700477176111310633339230276437229721;
    uint256 constant IC16y = 9933705451228650611278326586096391831353009857307978387146145800583167120995;
    
    uint256 constant IC17x = 1873431776301362766556114155405620940463761970766023270637839922071695805280;
    uint256 constant IC17y = 17345063994121352773788376809125691332887880057325339216256947757782442277358;
    
    uint256 constant IC18x = 2672878277523304704367067160462912745778401101784327737005816997806029693683;
    uint256 constant IC18y = 6983754708710285253525510946154388285714162241106662032994913489702590116542;
    
    uint256 constant IC19x = 17194088390271501538748829403751239454434110239901661032568747231559828342746;
    uint256 constant IC19y = 7216600762901551554614622415847114933576381905319122552034214460003257952762;
    
    uint256 constant IC20x = 19256972342398810509977763895723922154326936462877690229101165641337504537722;
    uint256 constant IC20y = 15579642919724840070586776934855293612891870480407581115668370534071948091652;
    
    uint256 constant IC21x = 18390024757572465963841738024190511752943929781606590525063272066732158704024;
    uint256 constant IC21y = 5768204117518379521231537573556611372484962700460627746900752000366486695617;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[21] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                
                g1_mulAccC(_pVk, IC21x, IC21y, calldataload(add(pubSignals, 640)))
                

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
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            
            checkField(calldataload(add(_pubSignals, 608)))
            
            checkField(calldataload(add(_pubSignals, 640)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
