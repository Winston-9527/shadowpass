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

contract Groth16VerifierV91CD2 {
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
    uint256 constant deltax1 = 12035988426525668474739110223405334659749477725235191741758223918005873514012;
    uint256 constant deltax2 = 9319634861033658388582119467022174078125492095660632023166530018989622736064;
    uint256 constant deltay1 = 5994878804383020286975595809702865710591571703130524816634033714510958709655;
    uint256 constant deltay2 = 11308452904124475436879398712388231226061046940472795304360937541571954400458;

    
    uint256 constant IC0x = 19704222075526623268038402906941472313629440040809284755100684253948038789897;
    uint256 constant IC0y = 17697536230346029668647144459128435464320856610392508186412401478230037277107;
    
    uint256 constant IC1x = 13978980568674475186417402151980127996231206479796692489628228106695151270679;
    uint256 constant IC1y = 20761368557970496269193450716980319670594663478623003390317702966445872394728;
    
    uint256 constant IC2x = 9954544097656081891609064989724160779828345561879682336673499569550351060287;
    uint256 constant IC2y = 3651490610272568837116398265525852773603713251276592539406119279341769002284;
    
    uint256 constant IC3x = 4375829390304974608833755405640414482503515811370971499337133895039664920948;
    uint256 constant IC3y = 3431499806700302212995968858275355303289055391352553529041716976266830684391;
    
    uint256 constant IC4x = 3968211601247067655699736832494271058714510138106336019362536807058692648735;
    uint256 constant IC4y = 18661976317448964922551677684299469983648929577115678505480719848610837184888;
    
    uint256 constant IC5x = 6543000498803452694641709058657559521804738392542992675057096774191058161660;
    uint256 constant IC5y = 18475400027955826403807959259963359487412669450845010083278684806214521218933;
    
    uint256 constant IC6x = 16889534339056169688652245968906275496504958030841424066802341530780715621373;
    uint256 constant IC6y = 4786614124025672869095906126026530849000742952757458547028406613767416114532;
    
    uint256 constant IC7x = 9866569327121452289298982930138113095184311073067360682453178023444192364765;
    uint256 constant IC7y = 12411250837904850865585310124376867404062827558387468742674561283896362199102;
    
    uint256 constant IC8x = 18346959609575519948092965350331794510623723319449749224008482944542884671235;
    uint256 constant IC8y = 7465586396270254120671649492721779387662999012453150287891516422426125617672;
    
    uint256 constant IC9x = 21010196244549880349648793937643175219358278161374215460672350043428385051253;
    uint256 constant IC9y = 17279427861055362321758300362576152269268367498782020330141789755768425762268;
    
    uint256 constant IC10x = 7964184937236595010720672216814037490793786815432939588870394597413713986249;
    uint256 constant IC10y = 13221210173776238826267929973787443122991378313274426496891642850760946617236;
    
    uint256 constant IC11x = 15343815468068810848209066253506537513390831891249509663470012684143524897656;
    uint256 constant IC11y = 12214610939279292866070547941658586263182957686168051894781146380915867082644;
    
    uint256 constant IC12x = 4970705862264105892301459604527717445878868917012554191823628060185967973264;
    uint256 constant IC12y = 4232926313311929992525802987768357862278892411889234153559827657239470198506;
    
    uint256 constant IC13x = 5008787965915773459184536289534223611266468201775045449570197533097184258414;
    uint256 constant IC13y = 9700738616599978240141826049832923453580996808332931491126667404716031446023;
    
    uint256 constant IC14x = 9441828988064632768101542322786063500448102754913786615686473578057689488361;
    uint256 constant IC14y = 1208042855425754081047299723464803966521811511516063858084137146612491741924;
    
    uint256 constant IC15x = 14054638039042826210660200904749365444436093612438404271718574226110247608883;
    uint256 constant IC15y = 5267188901958063531544465435416016504116609772329781579586359949368785044167;
    
    uint256 constant IC16x = 1208710829604069647193679465806313775505184833838510667061624649553185418853;
    uint256 constant IC16y = 1330136008476724019108071253406303019497112412783902662625599681276961223167;
    
    uint256 constant IC17x = 1576497965547769768856728580110608195223349453011172793567276246342674863433;
    uint256 constant IC17y = 16321057172617923549911801469638415476647587616148987624626807564651903765783;
    
    uint256 constant IC18x = 20864110303246538131205541464593000252578617807201192887107638769564674469279;
    uint256 constant IC18y = 8184323661340824496278060279070892047623428676777977351392846480424587257211;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[18] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
