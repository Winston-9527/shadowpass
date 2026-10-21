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

contract Groth16VerifierV9CD2 {
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
    uint256 constant deltax1 = 18679752563308624599287466830401968272825666225181330388549103370134839072782;
    uint256 constant deltax2 = 13798548327091821714981813234812793384064679648773696013619351242257000380182;
    uint256 constant deltay1 = 10222687360550306642707313894948910794448667866135496978626930729188004310054;
    uint256 constant deltay2 = 2224660722265690666052142726821067783209018633161709747083790449672712647039;

    
    uint256 constant IC0x = 11575670515422333663519559361838416745367208780193687069109478170880386114540;
    uint256 constant IC0y = 14943654872919544623574711932806724223240802412622795865208456693516735544500;
    
    uint256 constant IC1x = 12654099375804770455897204763120610244513448277209662732321119808636639556822;
    uint256 constant IC1y = 13456771738107925236019411957103830828755584964902994758818742528848907456737;
    
    uint256 constant IC2x = 11879240688911729815904327147592499003051691224087295323355056907013736378977;
    uint256 constant IC2y = 8655129355135711744952265764325708624406075342144219626768008906423909898590;
    
    uint256 constant IC3x = 18904077149448105598438132769367475696388700066894397201650397585256926893613;
    uint256 constant IC3y = 14153339120586048592602814719444210579913535849352723605654401148480773183782;
    
    uint256 constant IC4x = 6601874426070264951877327658763187418617950998605449236367752519732318405909;
    uint256 constant IC4y = 19125631392872360336895108956810137347739678928209205608025162158608030144331;
    
    uint256 constant IC5x = 2009782152593713791999162810465013142036332120255118926398280213130223453057;
    uint256 constant IC5y = 7115995322268711625303668785618410837967242495266814287351591514336063643974;
    
    uint256 constant IC6x = 10796164447301829098749844307840520675608277855872146467603905624291757892750;
    uint256 constant IC6y = 191093805032729573767137407577602899629906038815391848386509284172134250798;
    
    uint256 constant IC7x = 4212116533764934797390624692047091399361027400203581896232707522299276702811;
    uint256 constant IC7y = 20057424285871892973828692597543052206704308706109459009391769837027805938166;
    
    uint256 constant IC8x = 12389732396280349660603750308384859900173789948069044473076788022446476527943;
    uint256 constant IC8y = 13358957883488984705726569583881999791183970963329165127605950631014608478223;
    
    uint256 constant IC9x = 15828308871132517466858572756514252227771298605010678390142606239753734307260;
    uint256 constant IC9y = 18825714684880505866152247140913000855356612501914152895571633013093938282960;
    
    uint256 constant IC10x = 19058900492593157161899240582035835648150778475260777505813849597751109555921;
    uint256 constant IC10y = 16343823279184609448334185976507984938480869888789546005224249397876045675568;
    
    uint256 constant IC11x = 5147694655515472940040154329781467798598162078597839674845877145457223440060;
    uint256 constant IC11y = 9341686710540074797382319261768678932821207697132808075183484366641090866887;
    
    uint256 constant IC12x = 21154993711356339902223381606573323557022540188622069540938701506226212635673;
    uint256 constant IC12y = 1657789641508119644210670379852013850932380523215078396682922149126770642645;
    
    uint256 constant IC13x = 2997375643925376442634615020388877452993765416716116524696475408342988825211;
    uint256 constant IC13y = 2975285828827079223255714324844657817038340962624294739781924897497786808819;
    
    uint256 constant IC14x = 52962257930274616070166425683391932174239289291645216515549558908998658740;
    uint256 constant IC14y = 17679527645758245866379205485415324557697423361341032913895156548665526397195;
    
    uint256 constant IC15x = 187671355522190418970394070813613827064457917623687211153692951654742733729;
    uint256 constant IC15y = 645583104739341831439109187435423157269502628492063610401585406297806141011;
    
    uint256 constant IC16x = 14414301854044718046246168647957059770479216774931899805379755259116169211926;
    uint256 constant IC16y = 5307241275332316083392031074713503639310145106212719045178233238104566254412;
    
    uint256 constant IC17x = 6817252657281821342039659812254317498621425823007916329989148346416555521014;
    uint256 constant IC17y = 17550901206131046114313334825431313190454471273538062697630390086615247014407;
    
    uint256 constant IC18x = 11858318808135711801590912998583355653951684447376094550771029671361630614257;
    uint256 constant IC18y = 9448150200527544949018057465937628806253235651711120236137132629130523468288;
    
 
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
