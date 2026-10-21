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

contract Groth16VerifierV8CD4 {
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
    uint256 constant deltax1 = 15183629005729574493663589166716112268329378527754944365723153022689144670926;
    uint256 constant deltax2 = 16755353967659144234482151322632220836076456616761281318935889518167885062771;
    uint256 constant deltay1 = 20909447027751308193757848898840849409434672201521987492022888920805928459479;
    uint256 constant deltay2 = 21001100158093738740899958192831438251885188273086237567680681691740354289513;

    
    uint256 constant IC0x = 19930687641658025518822844371678203219672736477336400771650311198559344601720;
    uint256 constant IC0y = 20543998888284349453231338041988296090604921685590923459388692641957145101820;
    
    uint256 constant IC1x = 2816609166879385888540809079873997441003146944210440247109964008514622297610;
    uint256 constant IC1y = 21017596784060539316214019641079879780406310413947726966832960878307878884424;
    
    uint256 constant IC2x = 16959214951915261744491824474847615529600258344780146706448568804207111427855;
    uint256 constant IC2y = 18887992793531988730047870671424521249859634465898103206174806121182118266104;
    
    uint256 constant IC3x = 20174060235735387976694288643907222983064998379684209847014888367970406684781;
    uint256 constant IC3y = 11415155441759960589442853256222150948595806787671833038266367555322466436049;
    
    uint256 constant IC4x = 4071695079386644610616025169983336644271658543342884717947486561910961530160;
    uint256 constant IC4y = 17370916361848841391742891533437287259785842389694897428555864875777784053868;
    
    uint256 constant IC5x = 17223622236659649327972086037726636449741319039896908619482404090362967197247;
    uint256 constant IC5y = 4392840331894902492174440567618181102342322619484572323943294157380238029485;
    
    uint256 constant IC6x = 20913382517380066815656539170495751002833901863468484781465726181403949628300;
    uint256 constant IC6y = 5965551170790804303985175929657961257912867819588900125753317884401194972088;
    
    uint256 constant IC7x = 5125303729945882204812089866206675727347709368011622955841247749783022556261;
    uint256 constant IC7y = 16142631382339799948514818919815488809711977026530150033969208345058937561739;
    
    uint256 constant IC8x = 11347049338742912194190788824757943362519366283579737587090037547759420329120;
    uint256 constant IC8y = 20612217170763160031848507435177947226101187002758294574772938412906579500919;
    
    uint256 constant IC9x = 3281798985490686177123253663210820957199840925130750920667611625222821807689;
    uint256 constant IC9y = 10061455442076209932550249242911587998110839314337278810780954870480882510853;
    
    uint256 constant IC10x = 20516692706119898456823588505188509731334774604918129064612459360973111248689;
    uint256 constant IC10y = 14010289216807267566338642921776141872994505631683479460579666179296447952753;
    
    uint256 constant IC11x = 21309887383854735676557892280779667894494997278166411682783426316590258584231;
    uint256 constant IC11y = 11284007998914189495781446041077450582034773250092563102073979870974766178266;
    
    uint256 constant IC12x = 8168046369294092644935518837093102746584948512197709153101531390037623338621;
    uint256 constant IC12y = 3576160643356131794479396171566967955237819124586150888783749913266801743820;
    
    uint256 constant IC13x = 14264700000511191586424356385762571240560176873021481957400758705936974819106;
    uint256 constant IC13y = 10905393624904528297827017492147497832167456366314875129552190500238461979002;
    
    uint256 constant IC14x = 11602134676079345977189287708464571968257412929903390870809664269765106008149;
    uint256 constant IC14y = 21162528892189464867555467142894273998511002760915886718035277708053006917840;
    
    uint256 constant IC15x = 16971014262812672663850639189325340890240070864556236650608703139454703414441;
    uint256 constant IC15y = 11069638563904809234777832352881465955890587887139347340177784492530053544959;
    
    uint256 constant IC16x = 15573159384855874916231013200578471743374149393459243857418280748226873420595;
    uint256 constant IC16y = 10020664522170328940652684171742684034052627643488418458861488924596681725965;
    
    uint256 constant IC17x = 17314525230881388247112303789045118376217623008375517731215696258912150853981;
    uint256 constant IC17y = 5978853241838835775691073499678053996603818911517876098438958175014620572367;
    
    uint256 constant IC18x = 18837765662971967606976620412632628776869234639208610865561993385940309160875;
    uint256 constant IC18y = 8894985974071016943729669584616024082788653206932064655491299278053615113271;
    
    uint256 constant IC19x = 5581171029605060804684809957745469291858383711112210055916072902246940173775;
    uint256 constant IC19y = 1438772038636723790624162060384353711626519275176413662514099175869811345182;
    
    uint256 constant IC20x = 4463641382731321219587110282804379637578302606560586696417797769004325820602;
    uint256 constant IC20y = 6922289001309838027974797649486693184781878058559345194760370828562532230142;
    
    uint256 constant IC21x = 3515854733003702563556956911389123904324361318639130375868248126956432210073;
    uint256 constant IC21y = 16143153715975273232255406602821539884863928550363553227918970877428225029231;
    
    uint256 constant IC22x = 17139449860032590640240307768499284245614734894926017567743115721634964890008;
    uint256 constant IC22y = 3114924401204779238150832350920404964912703818211077993548469377595174383818;
    
    uint256 constant IC23x = 3830333590332273993172505975179805900115451649936175741563779558453886901819;
    uint256 constant IC23y = 5604069381054262085833548944977765549121986669191548392229123304154972476259;
    
    uint256 constant IC24x = 16797332426052321534143465562299950637527716606770965810754245880831159476251;
    uint256 constant IC24y = 16709068026518914318610584436010677800954195008217839300976296750601013430935;
    
    uint256 constant IC25x = 19124457334375853894536083646717583646073528767741220969511961513651262606144;
    uint256 constant IC25y = 8765272977499860210998258453506286455400222294242607246460356657634122640364;
    
    uint256 constant IC26x = 11770599410628241096974222827590320062848082395624050699332160050274311870380;
    uint256 constant IC26y = 12787654136058125457234605696986360851141065066677549282381339473965526752461;
    
    uint256 constant IC27x = 12757068665169646032990329468047409119934009233348783663785587999785726274420;
    uint256 constant IC27y = 2188179435212517330317964339986668161396898855695930843162687199519844107863;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[27] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC24x, IC24y, calldataload(add(pubSignals, 736)))
                
                g1_mulAccC(_pVk, IC25x, IC25y, calldataload(add(pubSignals, 768)))
                
                g1_mulAccC(_pVk, IC26x, IC26y, calldataload(add(pubSignals, 800)))
                
                g1_mulAccC(_pVk, IC27x, IC27y, calldataload(add(pubSignals, 832)))
                

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
            
            checkField(calldataload(add(_pubSignals, 736)))
            
            checkField(calldataload(add(_pubSignals, 768)))
            
            checkField(calldataload(add(_pubSignals, 800)))
            
            checkField(calldataload(add(_pubSignals, 832)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
