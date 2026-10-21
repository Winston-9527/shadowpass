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

contract Groth16VerifierV7AD1 {
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
    uint256 constant deltax1 = 9039557944189205566642923541533541612343967708304573944452801493226109550332;
    uint256 constant deltax2 = 21071984118308398687781365869258155295148838710866591492658928126839962578242;
    uint256 constant deltay1 = 16413988386244019995279761086816235158682428280100239956527218747620896371299;
    uint256 constant deltay2 = 11511460555545598872622089812509371442568666247127716738129208816199811722430;

    
    uint256 constant IC0x = 4417937347123193894156200292094626158914766365628086876411111296260548002585;
    uint256 constant IC0y = 8124546213450563284605702216328598377855620746682256634057109027401405991862;
    
    uint256 constant IC1x = 9063314425827136917813236276720943357017307367108391271454597130507525245141;
    uint256 constant IC1y = 9965066902974627107118055511849646376526976463804293204814375633295997623651;
    
    uint256 constant IC2x = 7010268459324476492819800147944780002754674347364843278880190879022961695993;
    uint256 constant IC2y = 13615293400002034033211059946884944005691576389033949925714066952602747400761;
    
    uint256 constant IC3x = 2438104804329089938092942801673222806831987841304199776194365897505485912996;
    uint256 constant IC3y = 7256961147124685926772339742455580441340601654398650598363041738336961349117;
    
    uint256 constant IC4x = 16316685201046143743958658514672992062827119505761403321287011132953701078314;
    uint256 constant IC4y = 20835344383980028115919616951263811148195143089102401262425247170577054585933;
    
    uint256 constant IC5x = 19409508218537933680615525956027056971384644663634470766095010621439011661766;
    uint256 constant IC5y = 15728329940028989569543371778534637897295334943993737880170886615895206296515;
    
    uint256 constant IC6x = 10514497167883253827685325730436471211839044732428910465089949566922908606423;
    uint256 constant IC6y = 10268045703368080795076680361617787875204251753160158985440645600016707651767;
    
    uint256 constant IC7x = 6857103322010630065123244673680469109408812551265758126279528132869010541298;
    uint256 constant IC7y = 8285225298849236333200673922532044950917043773638557430759007252405956455729;
    
    uint256 constant IC8x = 995503380419338757707913447141226421793561260782186100379391621495890175420;
    uint256 constant IC8y = 11131846412132240339350643231995599792752892979985040034046499236192760950394;
    
    uint256 constant IC9x = 9990165274004121965126816928720410728844059269844072240603035963543310750944;
    uint256 constant IC9y = 2930649033818880496702107809182250186693386258704943531858572952699567576559;
    
    uint256 constant IC10x = 6344350979680817341232418001909246356161310230715455040587989128286294919281;
    uint256 constant IC10y = 17545859763099528042903778637132466307929050249397415835112883868996822382273;
    
    uint256 constant IC11x = 12107318669267427432240198955821199738808757139820279017802069768614366933123;
    uint256 constant IC11y = 21615517169002942222261421789581704891533493757855854108020166947535574038961;
    
    uint256 constant IC12x = 3108129260513986155146677839951404339000040415025095283827647983604686359062;
    uint256 constant IC12y = 6142278552162511913047220300812283896950273450036878748737814091546394857123;
    
    uint256 constant IC13x = 20450130919212211312605240363872648048728683080134591234851459904313320790064;
    uint256 constant IC13y = 8309278880249034531289755419595151974810204618105217358329486904413309668326;
    
    uint256 constant IC14x = 4921817765189512141714838142221120207038977633706192286273848040010214365205;
    uint256 constant IC14y = 15044888396988659287502941697801866565888709075152660170221876841889481741738;
    
    uint256 constant IC15x = 4065532015147146691951103568736307628979581138363169484256969142407732384143;
    uint256 constant IC15y = 19589250906628663162845635135774280890607692619375475720804405963586224681863;
    
    uint256 constant IC16x = 8872371548501063071455158491302932087492699909636359872202149036627900995718;
    uint256 constant IC16y = 19978576553756229616270241393872852213083993125222207288286635260006324903239;
    
    uint256 constant IC17x = 9233909220749030505728207376457038524310532993026994571168826910719934147838;
    uint256 constant IC17y = 14498744352101168859466776966858535832750050780136613901796523834563514108998;
    
 
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
