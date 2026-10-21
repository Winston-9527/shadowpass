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

contract Groth16VerifierV91CD4 {
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
    uint256 constant deltax1 = 19210792052786400331279063642489286716954952084820299206471994369282770507179;
    uint256 constant deltax2 = 5816932931777243603661068396564427653610863463699237217404282863014076811823;
    uint256 constant deltay1 = 16091882328919499312672760228975323923992908991249966116391603327904599849959;
    uint256 constant deltay2 = 15752233590852009578805775535661616983335619582290555710368195201802076279853;

    
    uint256 constant IC0x = 3550965520735974444879814442090268095125614304086849641149466720476588643957;
    uint256 constant IC0y = 14344839053298056791165830273694176432541782627073479035182381211820683203887;
    
    uint256 constant IC1x = 19313131477848756846069877306096430820552990529704193656924311982495607218144;
    uint256 constant IC1y = 6405399710260018386501861997807554591795379874453946649001577588018006206397;
    
    uint256 constant IC2x = 5161025052005173214387538219061170612634195545917625483243390597019079144079;
    uint256 constant IC2y = 16242884543603696322628480030238807684449312849240604577196895452846118108312;
    
    uint256 constant IC3x = 8932363179576332798289574696343327075095591769042090925821866567493573021165;
    uint256 constant IC3y = 2263773068528348766942882681611547457892298837137562932351857974032085519016;
    
    uint256 constant IC4x = 21744906659492520414131585921153130152264942144768927366379767820475125079888;
    uint256 constant IC4y = 13995229760973445753013901737357874023112397771305338604645300333137109730202;
    
    uint256 constant IC5x = 17629418460196013009884195926197500652358368393213368788496962255927894282083;
    uint256 constant IC5y = 9605125254605351242874127620140705315840477186938566635369232201339579605034;
    
    uint256 constant IC6x = 16466294349431479268885963889865037011625835565571930821124728637505420532050;
    uint256 constant IC6y = 4593221854071208760645953542458997461219964792604229677578061343156257711788;
    
    uint256 constant IC7x = 20041662669585920332639544253232083082928119666375568576703671229994052595646;
    uint256 constant IC7y = 14583451028656242178923874406572391888270922414362594665294506510298260108959;
    
    uint256 constant IC8x = 19268063138824785743977140212150430293441630560565136407897076365073462432149;
    uint256 constant IC8y = 4868816489498879502995147083770793456620762882783166614517019035604122889838;
    
    uint256 constant IC9x = 19764265180981821137212916065181155612613030916208241221737493937987245138952;
    uint256 constant IC9y = 8827409391805586762988778413315134082670890752173261803466751943368899381284;
    
    uint256 constant IC10x = 12834285440248706573311181449319129553365201930374028980901717128876107459914;
    uint256 constant IC10y = 17244390337798586264897171888152500246862548194658174118198528572608859679088;
    
    uint256 constant IC11x = 8217352698006921545377662452010096952734338534082012093079133622564977483062;
    uint256 constant IC11y = 603359560252010347633178545366580098297842722466309013072969085266848043538;
    
    uint256 constant IC12x = 16792003345563995822367456829025683867691230542783812542394313259025828174149;
    uint256 constant IC12y = 6859209280589895974869933401741053694941062254837923805466655509402777709109;
    
    uint256 constant IC13x = 724747650132852526122085514663192409269391596739247399090556286929922770189;
    uint256 constant IC13y = 879211672234636588141009530038662733126475166102692223577018154754395486168;
    
    uint256 constant IC14x = 6518957955840333471199284138201709630080067136698927361216967652156082166772;
    uint256 constant IC14y = 2402635243468192056199837135472703835637028222524315938886516285716452834316;
    
    uint256 constant IC15x = 88949609868350829416311903686737915814165397316715876609160266244266067507;
    uint256 constant IC15y = 8125898958882105104069142358589969238923860515278274957220093205144337428864;
    
    uint256 constant IC16x = 875022103697564488854715447090151246448438223434426266860745817251560036966;
    uint256 constant IC16y = 3193850003518697578844900588517670582216487650317837000538838827225184279925;
    
    uint256 constant IC17x = 9854532956633315468006012271501101383011329631108030038951064747090015588610;
    uint256 constant IC17y = 3618905248124631457308665531789852161144883189968278043406300387176559859632;
    
    uint256 constant IC18x = 19149717037132583887265872550408986350705322486317977565298819477207930827680;
    uint256 constant IC18y = 14117245328014827086602067262925719041058068401402846079479906917160889186875;
    
    uint256 constant IC19x = 2064472676099207046288842781553677872190961161194922937309893410397114310928;
    uint256 constant IC19y = 12682446211525971636656161536095935154084663382828700191732271711449693399570;
    
    uint256 constant IC20x = 14041629263629760821467986801613134279606272103539019862596139521954451313783;
    uint256 constant IC20y = 4927432103829076257807768173397368118108424543605348859752547418050360898998;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[20] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
