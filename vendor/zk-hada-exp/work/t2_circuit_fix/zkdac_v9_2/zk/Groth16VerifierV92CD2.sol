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

contract Groth16VerifierV92CD2 {
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
    uint256 constant deltax1 = 50209513458547017345730317958148520887693946650210818229417693464435679908;
    uint256 constant deltax2 = 20670042485814402319952436521440507514153741974987335413077313971858950370700;
    uint256 constant deltay1 = 14856229674376584935146836466743322709438131753439069667633571289915904724022;
    uint256 constant deltay2 = 2071872672194329976611665491788424218989274990176447661903404115579141118507;

    
    uint256 constant IC0x = 10831783334286328746752420956022928635445525723007276887845042768508094301803;
    uint256 constant IC0y = 9952456585786389048120655834730006592445513508853574164440795047926248769822;
    
    uint256 constant IC1x = 6728880456725581124191467014721862355994397843744904746014907952412993626756;
    uint256 constant IC1y = 5085337808739025333930457414109177141562393414070368971847855378912458008740;
    
    uint256 constant IC2x = 14125491080040902086615843764736803880704558923149658420854577620022346510233;
    uint256 constant IC2y = 13692380402838128616124534174124758335939615618944139539457981920357857062300;
    
    uint256 constant IC3x = 7536660938866005164268613158662233910902417259878725580455532061768432562652;
    uint256 constant IC3y = 6821903923871279699403375246609998855276454531575796385058363276238625277029;
    
    uint256 constant IC4x = 16826277463055565386495725752696882957950384103509707873801421302908965114523;
    uint256 constant IC4y = 11971110908164154105111431084785384663725457133948835128572732863939788950553;
    
    uint256 constant IC5x = 16617793201158991672884718187640748992690621049299333849405610736779354367938;
    uint256 constant IC5y = 9423109503405643717006404718214629052589348501181513950674009409582469708831;
    
    uint256 constant IC6x = 1023289851621120540774907806823842095894192015985217540304381506008106702080;
    uint256 constant IC6y = 12214226195063630547717609340534008311507001931774723385067714568100032439501;
    
    uint256 constant IC7x = 18346959609575519948092965350331794510623723319449749224008482944542884671235;
    uint256 constant IC7y = 7465586396270254120671649492721779387662999012453150287891516422426125617672;
    
    uint256 constant IC8x = 15341584916869517781959123085217999115589762673276680928659330193631204740333;
    uint256 constant IC8y = 8423097593340622476349792468593647479363596520550822233570313423213059727978;
    
    uint256 constant IC9x = 7964184937236595010720672216814037490793786815432939588870394597413713986249;
    uint256 constant IC9y = 13221210173776238826267929973787443122991378313274426496891642850760946617236;
    
    uint256 constant IC10x = 21316824521086149233457609090992715094352621450236577491893615725818734971055;
    uint256 constant IC10y = 16935019414029782173446492011091894285102081747881688602471155983952314469881;
    
    uint256 constant IC11x = 4970705862264105892301459604527717445878868917012554191823628060185967973264;
    uint256 constant IC11y = 4232926313311929992525802987768357862278892411889234153559827657239470198506;
    
    uint256 constant IC12x = 5008787965915773459184536289534223611266468201775045449570197533097184258414;
    uint256 constant IC12y = 9700738616599978240141826049832923453580996808332931491126667404716031446023;
    
    uint256 constant IC13x = 9441828988064632768101542322786063500448102754913786615686473578057689488361;
    uint256 constant IC13y = 1208042855425754081047299723464803966521811511516063858084137146612491741924;
    
    uint256 constant IC14x = 4290372366392959100334613409189379717205241860499234344123659264940419635000;
    uint256 constant IC14y = 8151699257831178759367868877134881683326231385281887465001772062690641413146;
    
    uint256 constant IC15x = 7143923832041180409295708637959173736127555055246976697042061259557606689299;
    uint256 constant IC15y = 8237103492260906733773143718838707175191938009247700196930061344514165217159;
    
    uint256 constant IC16x = 6509355702332663473252466912560238645196704766635076573704056926141191677061;
    uint256 constant IC16y = 16758989653546922515362026372839978297753307694123079423338137840996392938581;
    
    uint256 constant IC17x = 6207927670543445082655378327820835001011439386342507869991772691039478007717;
    uint256 constant IC17y = 14417840076637963714038549327073814449808713738562388209694156726362979269265;
    
    uint256 constant IC18x = 16451230923509768813330166020591545477317948913332984059875675617614930067657;
    uint256 constant IC18y = 11692980216160874462292450002393653240880194363057643141416550731009938318030;
    
 
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
