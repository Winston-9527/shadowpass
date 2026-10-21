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

contract Groth16VerifierV7CD4 {
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
    uint256 constant deltax1 = 15534953770358344041043258080153799956275389119499513727415389808924461047494;
    uint256 constant deltax2 = 5455680118843602134510704295492202257542449945979024580151206986168571905580;
    uint256 constant deltay1 = 9128661505201700604970236641753584972201644992401080075448196672016082361013;
    uint256 constant deltay2 = 17286188529229408889250131227089447458487533546775453105351678884872827852416;

    
    uint256 constant IC0x = 17933488535978009450742394294867075680991260137958616946199409288711326592992;
    uint256 constant IC0y = 15220174985910283309421077675129122019711296320994817069518623655911456080747;
    
    uint256 constant IC1x = 15581077782047510230006455523094717578718037126700826395619480846041125985293;
    uint256 constant IC1y = 18996284776850030265192720616808121143524401111646025461805434663366350558792;
    
    uint256 constant IC2x = 20260773726291843808254140040098097566418691923829363170683635419001818095093;
    uint256 constant IC2y = 14884568798238128102248123774992016123075558382156006451914425975251631617238;
    
    uint256 constant IC3x = 9311804898594054473052814012108644310415364619074387986552637476076172646744;
    uint256 constant IC3y = 1337453744396376109252338184356626893101824177632644686860479568711755643300;
    
    uint256 constant IC4x = 2361293298371120735943583663377456073772916892393038565292224555555011716534;
    uint256 constant IC4y = 15980639025112878450926015236821990477958706863128894825778412410931807409424;
    
    uint256 constant IC5x = 10266918412889550902630649896959431185014572075094809133911435436425663257160;
    uint256 constant IC5y = 16521537230627098785145145991484964087984689622252157830184000811034775965455;
    
    uint256 constant IC6x = 21527452010495128518508077948168960880944852007186147735419166388584577218680;
    uint256 constant IC6y = 16914653663791112898156372971119454476000292409056157016210988393302333796026;
    
    uint256 constant IC7x = 6810495820705020448308281307686528735257392710562850562165756717435811214132;
    uint256 constant IC7y = 439416527268281945779892173799965465491113394121951665031324988191237322659;
    
    uint256 constant IC8x = 16099320009520153960649808092831637280251803746294249767766173843058464158935;
    uint256 constant IC8y = 6397458212380970337347604266383719141567548135489021002923516082240877684682;
    
    uint256 constant IC9x = 4360857149810903021069471564148148572871600416565016913476887044617041764973;
    uint256 constant IC9y = 6100874291015341495601229547849193109167772485986325003358894499122559747291;
    
    uint256 constant IC10x = 18169853615789001130654622579931870070003621121399099911489528242546592502922;
    uint256 constant IC10y = 16919950689220067996786548942588860008622177653677291760723731773665961982074;
    
    uint256 constant IC11x = 16590196041835881497531852679284166830753555946990201710589725420586055297577;
    uint256 constant IC11y = 53863381419825791322657799305598470030358365063323087751738078954984358634;
    
    uint256 constant IC12x = 21750591906524391956530460106700983446027749301643069891960847324002607800076;
    uint256 constant IC12y = 11078859326596279333671528819936408877100413817306530331555909223493194898311;
    
    uint256 constant IC13x = 3781039676229840425979706391753691773362312110172984121557384049479913850517;
    uint256 constant IC13y = 21820138245060368978979416286602588896357219443645505855071712149696607276931;
    
    uint256 constant IC14x = 15704154609273843900636181390794431446485490603823272082813645829983707082624;
    uint256 constant IC14y = 6719181058305743560154211513497083723376619088444305088954071754717542406113;
    
    uint256 constant IC15x = 13160227651453887545155629024371179233886348859130072770906756946123362535411;
    uint256 constant IC15y = 5502720971101531024212850007139505567848469028493821011728872546467112354102;
    
    uint256 constant IC16x = 21507124214451952548215830776196956971760537311925533552456850117735580133722;
    uint256 constant IC16y = 21185847395016513452698341141768219147308879662820864468477634492169663272337;
    
    uint256 constant IC17x = 16857176256242522734999172114493895999716158000244876041658951216903403443822;
    uint256 constant IC17y = 1940890890824262874032911691486818156845635798238865232390508103781604498778;
    
    uint256 constant IC18x = 9436797221561229778208088875320322679929564829396948427123837963926341876332;
    uint256 constant IC18y = 5412021030906091454135846044068733677273232764994835927457256166321261155671;
    
    uint256 constant IC19x = 6588480564341683359522902685176906379498242230647303469480751446235772101791;
    uint256 constant IC19y = 19565274106831046100129035970935818628801867518264589443575714165454401917524;
    
    uint256 constant IC20x = 16800701300605497812652344793918863226747461959176942989357575452009220839342;
    uint256 constant IC20y = 20577658737810743647851256401298534971471916632210805309199503365277661644137;
    
    uint256 constant IC21x = 14919262504640489998130903146661003393573356199436505851325399861503318614971;
    uint256 constant IC21y = 3121560546771086256035232847979097091121284096608286219623231732932937372299;
    
    uint256 constant IC22x = 18149286681153661873625389980665039334008435050846918051569675702270225080654;
    uint256 constant IC22y = 12405906898991404998201420167458850146448636088166878069473293338024665520235;
    
    uint256 constant IC23x = 15589028122992537703534135350082961149894518247423752846785330251994973510514;
    uint256 constant IC23y = 10045185593354465330668722296538223639895683124405568452192421394465316695381;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[23] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC22x, IC22y, calldataload(add(pubSignals, 672)))
                
                g1_mulAccC(_pVk, IC23x, IC23y, calldataload(add(pubSignals, 704)))
                

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
            
            checkField(calldataload(add(_pubSignals, 672)))
            
            checkField(calldataload(add(_pubSignals, 704)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
