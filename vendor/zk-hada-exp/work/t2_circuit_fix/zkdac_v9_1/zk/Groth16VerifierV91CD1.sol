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

contract Groth16VerifierV91CD1 {
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
    uint256 constant deltax1 = 20588530437584914171763886206392599750053916727696903155018543161870573748909;
    uint256 constant deltax2 = 21531004980588739137125777726179556666127813810525883885326869727412225218864;
    uint256 constant deltay1 = 21787538468933912387402304844529144276746639480310931506692617933104958658100;
    uint256 constant deltay2 = 444934491064737816639843632537055098758916739346587294226710797743156757381;

    
    uint256 constant IC0x = 8672912106436601828109883760513382865950538734034779580445765764910409716187;
    uint256 constant IC0y = 707666541264284474792911734377144421012551721195543286502657201101913616186;
    
    uint256 constant IC1x = 10413883226175470882122817600687485364506814018371049420102916965121023513153;
    uint256 constant IC1y = 3327917590939941062551880633767187249366906243626619007561413731456505036975;
    
    uint256 constant IC2x = 11861426398709128707631246038084103651460913959698644898651168560650442969518;
    uint256 constant IC2y = 3196185075804280149558793136825645755841701008368485056354572478502438643340;
    
    uint256 constant IC3x = 17156290330218355938536278348623325393780984367268139441843580506970755524143;
    uint256 constant IC3y = 12091774891049858822501397509019158324258331339806010855887670647771053684131;
    
    uint256 constant IC4x = 13095436078948885145926720214141445165809229544518459776838039316740693830760;
    uint256 constant IC4y = 20412738245815112955206347484096831932892554478406165506701683303010887370242;
    
    uint256 constant IC5x = 7946485539921893687011442783448712671901731947920714665374600866892173095622;
    uint256 constant IC5y = 20109311846575421933476813885470222371632035752309043757241884508844309119852;
    
    uint256 constant IC6x = 11765003744655005917767272055103748747303692483815753590186716267336804964045;
    uint256 constant IC6y = 1409840408246932350549256069462126168169729910953886070792683370231646413267;
    
    uint256 constant IC7x = 3238742143658264231560775272745195815296345578540123779672781983305535598020;
    uint256 constant IC7y = 7805783988058759371615837958892094507382517547039273408488011293575176657995;
    
    uint256 constant IC8x = 2688700077042458215580246707453232746016850573412507223633553354429432537979;
    uint256 constant IC8y = 11322912500745613459222376407549461863848385576582352584210687343792540292185;
    
    uint256 constant IC9x = 12503792757410607783856009715777084729843459666272780497385397643401693676815;
    uint256 constant IC9y = 4953510332985693125925565703082116363387148928395798085369585760945654778400;
    
    uint256 constant IC10x = 4249186964137305187932427830368210598188971073939450415495074650304319102555;
    uint256 constant IC10y = 3538301482789743660830042203660357917665517682217592552446954315373062364384;
    
    uint256 constant IC11x = 20023189039773524563993399334324014651942809351318850975105068963580075942518;
    uint256 constant IC11y = 7106668718323413411892268599284025826886141249914041400320658746569513384645;
    
    uint256 constant IC12x = 5168406962149543942935932386307582040194367813939923619870956662341375809483;
    uint256 constant IC12y = 12760715677591468424567210875631847290268205909190610477610886293476871046284;
    
    uint256 constant IC13x = 5361473803094451594528466826947994122239129466329104832878768357746755038171;
    uint256 constant IC13y = 20087582092425272844738425077310013897692559713536732244225422489080619438891;
    
    uint256 constant IC14x = 7957251481659475030139349460379612978286631316515292834386388368129565313016;
    uint256 constant IC14y = 18792465485411072573626083842144471045077187859076761418206705516229558935285;
    
    uint256 constant IC15x = 3021817205454894294994725246030797239891725821029114357837501413465992304544;
    uint256 constant IC15y = 21560907846247251888572298732513610485706325551946994272148714128222198478469;
    
    uint256 constant IC16x = 8935925976502960074952385485571508130086387609410622445304105197823689920807;
    uint256 constant IC16y = 19388171458158221914384309486504288539781130654829575579211547279054756071390;
    
    uint256 constant IC17x = 17733461652936458337193460800374025759649417490271670860129515818184353564451;
    uint256 constant IC17y = 19006979771552634003315159117580009185569845935625292683865738802668554278963;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[17] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
