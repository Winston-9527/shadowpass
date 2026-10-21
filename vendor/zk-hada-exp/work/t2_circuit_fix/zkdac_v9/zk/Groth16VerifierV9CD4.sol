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

contract Groth16VerifierV9CD4 {
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
    uint256 constant deltax1 = 6422762895241956857576270761462932686297035264276376018919394927649235366087;
    uint256 constant deltax2 = 17178897001454922850827360165231929592128725602072789984003623649041922996830;
    uint256 constant deltay1 = 14584166993035568339693808968907889219591886231809723955065483187769217131005;
    uint256 constant deltay2 = 20784470139103605979380868518654781968404269235531774590322448040872253120196;

    
    uint256 constant IC0x = 11674533584767630083367210928521150131947535284287151640896532585408604331276;
    uint256 constant IC0y = 18274187734329356675315766002858476319800936706472221056069413289242038623549;
    
    uint256 constant IC1x = 15819135846388608390248604884936641576585684932300363431208804688081094594258;
    uint256 constant IC1y = 13471246610170243081785935624099552675152101798488071926067769394801289577082;
    
    uint256 constant IC2x = 818657971325383853863597134877148950176714536396271673463957287678929949702;
    uint256 constant IC2y = 13709741750051871593117776481002514225520441745147811250285493922685416262084;
    
    uint256 constant IC3x = 13342285888623255846591213293962748258290736849478590942420413203959817989762;
    uint256 constant IC3y = 16110001269738497714481655528842368045091518086301833842881551560747819020800;
    
    uint256 constant IC4x = 9079949241917786859576008761536166975955984736714345711631433194127264271762;
    uint256 constant IC4y = 21821802527693013900823620206412993146397907206521069791811158243866551464453;
    
    uint256 constant IC5x = 7020416653296601525771193923886392298569236536187383434759278382132868082102;
    uint256 constant IC5y = 19661229291823381610372656742500391231257608006656059852924871133510652703876;
    
    uint256 constant IC6x = 19761867561636163835048098999383271142741798727696417182999189692321073616038;
    uint256 constant IC6y = 13975702596176332716397876543630517577762670747425869737112389233163855523446;
    
    uint256 constant IC7x = 4844382690694608571374824931277713267799174822446970405731055812030526297899;
    uint256 constant IC7y = 20840707425496861388623250921833802732585045661203922369150139466640090845108;
    
    uint256 constant IC8x = 6165722745949656739505473007699139017875057213572275786840177098738383283665;
    uint256 constant IC8y = 2136279926731944197517850206296101064796207549426588864817406257608606521087;
    
    uint256 constant IC9x = 16718799290024279413028837832898836959377430003048837913167436487261242751357;
    uint256 constant IC9y = 6221530530752500556753964862102944993191515029042987603479208257097126327651;
    
    uint256 constant IC10x = 13864503593425161446175617691997085430317162184883713462515872969924511873851;
    uint256 constant IC10y = 10087708212957448679095302442174593587552527520295141315246018779942830103051;
    
    uint256 constant IC11x = 463398307328452251553191008771581793475979645055442017716641011148025934256;
    uint256 constant IC11y = 11731390104946001683911213343717137420655749907696826223004631857274387497428;
    
    uint256 constant IC12x = 18148549708613662479664448342628185015490498680373700114249433573830120187160;
    uint256 constant IC12y = 18573337612591713136385880765695854189048274539360772348869731044249561427313;
    
    uint256 constant IC13x = 3150751008780089749604977113151358518038237005161746427798393134816465876207;
    uint256 constant IC13y = 4742648991601441528030234821309890515277731923123886129513515703759808452997;
    
    uint256 constant IC14x = 17199659050533046800404305631299793904544088339726433144212502859383215164343;
    uint256 constant IC14y = 18637756571716547275233735910073819980582692383105709371436526191108204245821;
    
    uint256 constant IC15x = 15160741868712334939951785335499754131938550039301258671486003957663770691898;
    uint256 constant IC15y = 18623305852684008867217784125181615923110512695843106170978564733015863440085;
    
    uint256 constant IC16x = 15298309883215551242313196476033337204666677568963927742577550966810021341379;
    uint256 constant IC16y = 12114941717220563791030779994963669898381047063195256221549401499075133380237;
    
    uint256 constant IC17x = 9167891763170946161947039910907242434914797238854328566426387069079352406476;
    uint256 constant IC17y = 9258836062944157693613434211107084509963446477516592644487823944213258204954;
    
    uint256 constant IC18x = 4233493783548482712920104987268227270749680053435465681579931895988493811594;
    uint256 constant IC18y = 8281262246617929366245192314498639654257641330257172037440107644259581624081;
    
    uint256 constant IC19x = 3677538069709697022958622863298393923403953404952501666576818537845496161396;
    uint256 constant IC19y = 5796468317551430666587071288990195733590152893247419932768229113631033696368;
    
    uint256 constant IC20x = 3836307496157110267896795828434841353758153926303363011498492860156983347195;
    uint256 constant IC20y = 1391613517996867673261744221873895117557227977415540277189682412119858417106;
    
 
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
