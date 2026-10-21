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

contract Groth16VerifierV9CD3 {
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
    uint256 constant deltax1 = 20765217226323398390518195306984229282798057361055376810272525565664190519587;
    uint256 constant deltax2 = 19143808067735353216820826550190893470116438992790137190197148283724096648176;
    uint256 constant deltay1 = 11046019045085123999017626279668818931069180816485454303600899323701179482927;
    uint256 constant deltay2 = 15262343998780964840974431030042147119003742431466985778691376289491681902451;

    
    uint256 constant IC0x = 2022416937351405012712788285084189859453712493218480535319266497973600707885;
    uint256 constant IC0y = 15768224566647342619271874453571949661867181254993259262924645745918610129393;
    
    uint256 constant IC1x = 16202032970525244374097106299174547936325561455579028279437470142740758837313;
    uint256 constant IC1y = 17480363652601969293476439575207369642552718046639720469452156041611155612655;
    
    uint256 constant IC2x = 8757702584202688599643656333905040863702390657775097973253058078434181587516;
    uint256 constant IC2y = 320262722674405963057987413325974470305171964394527601487762648763617170007;
    
    uint256 constant IC3x = 2397008901528502845780689943572657040951621696654288428037784152335607765086;
    uint256 constant IC3y = 4109604152620090102151809710440998968804249170307365028741318512002140441166;
    
    uint256 constant IC4x = 8586318425355086575546661790446318832731319073214292595644652839693045511614;
    uint256 constant IC4y = 19288010987790324048373345341436489783378232332549144897765002400820567487693;
    
    uint256 constant IC5x = 6907013186198730484020839945245191721683836109305316074996950415599214931125;
    uint256 constant IC5y = 19921587544841217957538200712838464669958022609026858744262655442234305976711;
    
    uint256 constant IC6x = 15013159110064780002676161572427137077026098538675359370430409395331977846175;
    uint256 constant IC6y = 14900162928225060025850895557913533675983930597369940308111812147699950176236;
    
    uint256 constant IC7x = 21198695624642230053462758544023820300275900349448841245457725915985177580312;
    uint256 constant IC7y = 19236598492272413576450103124659761430185491455136334786270705394397063277737;
    
    uint256 constant IC8x = 21881895828885396881496209726717947614728489701691543266180255071182260059990;
    uint256 constant IC8y = 10112522340154757993569538900084571860186479305055275733532242679753370716858;
    
    uint256 constant IC9x = 19532834258698682096817721274496329428098096264115903574121580298293406835117;
    uint256 constant IC9y = 3910765219795912380172059419253531384732910887334424550721168918383078145350;
    
    uint256 constant IC10x = 18057288093961854543045742950320275216767259710742642693824502131923852574887;
    uint256 constant IC10y = 890416854334849345182100212786159987636485506766944910232277338020379097872;
    
    uint256 constant IC11x = 7745269239250580779097603795147794026157993394413570499804010214154143202797;
    uint256 constant IC11y = 15073718000634862700534132200593397847700120564880119843957948361140885059101;
    
    uint256 constant IC12x = 10396393464801183030484062221993489443662352697225872621809199749837706008518;
    uint256 constant IC12y = 2644785693837798125378157397295514508352281784922438623038146287794090555148;
    
    uint256 constant IC13x = 11524966436995020257640313649024204534989520966195161683851628700163775469641;
    uint256 constant IC13y = 4534709999094105662807258571641295999280074128219787485443930192454465375776;
    
    uint256 constant IC14x = 14184185855264838216614233198796596791917786638803339765202588832810973792088;
    uint256 constant IC14y = 5676897990352543907872298946885967605862656109811617593847013897583559697765;
    
    uint256 constant IC15x = 19043135015262026670386396287244450702727207631629882482876952917282529520512;
    uint256 constant IC15y = 4758572163182278221028874168363261625071733315389836156346788878560521690022;
    
    uint256 constant IC16x = 11625556206399256258723164013201320011537302288202054589500155276594604488403;
    uint256 constant IC16y = 799876512830685026119338596243652192083127998540128467936884951222052484792;
    
    uint256 constant IC17x = 12075121623987651521442905116577571464136105322753760838047530080452901094140;
    uint256 constant IC17y = 18072941216973409619291648855319724190856789468314619613983490270590224005320;
    
    uint256 constant IC18x = 3973080594034810294081935227822247738762424465217364085521787298041184350048;
    uint256 constant IC18y = 8665373989259004738707276690425677326251799977562332332334472751319451446801;
    
    uint256 constant IC19x = 4957924250763008471695817666790473739065553128464089583543541365931871587200;
    uint256 constant IC19y = 21160230590335426348333689600068304298609234951569780737541810927337636027875;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[19] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
