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

contract ShadowVerifierD2 {
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
    uint256 constant deltax1 = 14828334417897323160321758394367455967124690756658621952685553345288412248493;
    uint256 constant deltax2 = 12313587283170973700822081268036591104009269993452986558788399282247383838532;
    uint256 constant deltay1 = 14715908562591420706880024811764239461350064885654396224029679666401216357798;
    uint256 constant deltay2 = 14003592705843629106431127156006297401096652774166280637699529556993578511202;

    
    uint256 constant IC0x = 9861342353457149996473170889535776648090623224870666025364055937257393009442;
    uint256 constant IC0y = 2123574056665814443727440183262249075093112683200148576777552538666110564755;
    
    uint256 constant IC1x = 4028463178694820536627925730392478107257300775236123277565119238044982868797;
    uint256 constant IC1y = 1822489030374014817596076422218871066058780443018313676087549972246712054567;
    
    uint256 constant IC2x = 14733391633591992730657083557250141847505121423384430704025730808654257959187;
    uint256 constant IC2y = 13099387019603371147683747877341515338225415561629261526554607005250334835743;
    
    uint256 constant IC3x = 17910958980279832598501881661954709626568091040882835635870268231092072890490;
    uint256 constant IC3y = 4104335359698303762931717351116422349398291047679653423193118817236477958599;
    
    uint256 constant IC4x = 15690647084225683083125382018408993562764446066008500144184426797098042701111;
    uint256 constant IC4y = 17427189546286558808399189585427616333104150331257679366452529593399224988733;
    
    uint256 constant IC5x = 24161127216051364864455108401026526878060985406089499726528324263397228732;
    uint256 constant IC5y = 21408392199230434658821529740481381158594359493458219939625972962833033188531;
    
    uint256 constant IC6x = 1738072515154805576546982932344103855512459642807209036811153555364723287878;
    uint256 constant IC6y = 2339744967263098469483126899832525752998332902026947101566600681712073963503;
    
    uint256 constant IC7x = 20013932818978067746506828263809126349674846457256021544825775925666562178381;
    uint256 constant IC7y = 1196081277410760618269432338350287955560154157688931939766833654583024876096;
    
    uint256 constant IC8x = 2962580778283146922059255427843893401038375284347317937841421384689518802173;
    uint256 constant IC8y = 21656526819696071193159108625188944147745259832179995667529028210278178697371;
    
    uint256 constant IC9x = 21231435930247942753415020227820292467970501957120684396987143792256587359787;
    uint256 constant IC9y = 13101767782312513068463084351134594914041703119214620295864267095680163740962;
    
    uint256 constant IC10x = 20190221655652968121480855743883070097369679357045076601053609866516918168201;
    uint256 constant IC10y = 16814790464620922877032332880676506936997134778188249755876537857646865471637;
    
    uint256 constant IC11x = 15198707726073816776793452446701662515392478485254106626884150261305254831165;
    uint256 constant IC11y = 12417845939715643131819256638736701421192087036941057078620458413576404564660;
    
    uint256 constant IC12x = 7592767330147279101579988123714438897084748223331871009705619142236067915199;
    uint256 constant IC12y = 1055829351864056625111573563322675794723253258821027808073299597792574337382;
    
    uint256 constant IC13x = 19102634411685218671338216363366048250056895147361217608668709934400247775514;
    uint256 constant IC13y = 5213405126649380542867572268666073951528867273563989765634118038923613974590;
    
    uint256 constant IC14x = 14377842029996504551147826723294278990405761390386970646353804928225129754289;
    uint256 constant IC14y = 14432384550810043741096140551397853593240359948593979734328837674721929439923;
    
    uint256 constant IC15x = 16820844680764330029489727714147709259068268726779507232543582968993835645059;
    uint256 constant IC15y = 17279473528296083508133562292472769782005778518377146407040078575273284696114;
    
    uint256 constant IC16x = 4539529143542175682927709189318736714374653357173398968601820155496130979312;
    uint256 constant IC16y = 19687297847203319380491939507600492144903331333204787921981576705384062876964;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[16] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
