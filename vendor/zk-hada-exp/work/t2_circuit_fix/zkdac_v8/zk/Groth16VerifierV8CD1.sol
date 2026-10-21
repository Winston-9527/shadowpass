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

contract Groth16VerifierV8CD1 {
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
    uint256 constant deltax1 = 7479608456454793324594699264257380209229390067890376188463033603235968153538;
    uint256 constant deltax2 = 15662403537511986676006639289804995540896861123807973863499668641586197870751;
    uint256 constant deltay1 = 9042736699490224924822613763221034457645578694105996554619563976781680909077;
    uint256 constant deltay2 = 5123644734643981468596730416325470052704270093019988815199010990479037530981;

    
    uint256 constant IC0x = 13960883640443130631712074697244277041144644166882773757497662237010809512517;
    uint256 constant IC0y = 4191419077908900236763704478743898437184197123732131631020793930072374358637;
    
    uint256 constant IC1x = 6054183100359534642547416711846068280196871058968337325023335739068196804919;
    uint256 constant IC1y = 2452263974195180605710818503764790723871607556942815303381259870826507812953;
    
    uint256 constant IC2x = 4354243607247789209954443424022144551828359777253277177591971973674970891921;
    uint256 constant IC2y = 3373961905502812579969615522699061985767720866761295062057119751051414526406;
    
    uint256 constant IC3x = 14788891424307282664167160359017352355883260602345643356607217320400194172739;
    uint256 constant IC3y = 7357253982883658933388159361826776027776728489170539205854909506634219010427;
    
    uint256 constant IC4x = 17879888306149260298662406323874334101219577991326671167253609660025189655613;
    uint256 constant IC4y = 7820429676724360605126652813001490457695688167140334182485175299146099545655;
    
    uint256 constant IC5x = 19676351168299649977222020170906562299006145739203190699529541933413517603310;
    uint256 constant IC5y = 12908136095632677511435584697480262342844786293704590737740028062309485411124;
    
    uint256 constant IC6x = 18312829569139895718342098104592669619498321808671206218534725499726594298242;
    uint256 constant IC6y = 2858776450198162665508518270178008359502453857908607510266652831805872636553;
    
    uint256 constant IC7x = 18576535807829286460662295430917141407927014153448962630729396166152098639519;
    uint256 constant IC7y = 20525248505812778301234306061983207109353431242885765988064125617189461937508;
    
    uint256 constant IC8x = 1363268693762243521890815644329208931298133053381250543363018246320029714698;
    uint256 constant IC8y = 19226107397738285524485195121744476594699533146466462313051782375053619172912;
    
    uint256 constant IC9x = 11170310631332150302342612931142059430219704631889621291476066523737122367616;
    uint256 constant IC9y = 8219867335236414063405887323910492692553549527408121206694294932145838349186;
    
    uint256 constant IC10x = 18494434634014331142595677140644717918393522498195122526336917209829112228389;
    uint256 constant IC10y = 5224480451214558181763778523949971138476586057016389987259006431793492022888;
    
    uint256 constant IC11x = 7000908090133669936113174590450689437377099440797215524112824218118563115319;
    uint256 constant IC11y = 18166187309838089365299356555882579113153861318249868607227393052613204538118;
    
    uint256 constant IC12x = 2814944996632579100686743833377827413352838386583713288066105499705669599214;
    uint256 constant IC12y = 11547947765247898893932603363844189952150071147228462703399818718019772865771;
    
    uint256 constant IC13x = 11186619095141168557918000769515934271075929037353644651805647289041583957648;
    uint256 constant IC13y = 9069785302618163687306039998325704613179266165900752681651175371117623093086;
    
    uint256 constant IC14x = 13197417459275923319284064724755110156399617861461954390892475470269936174986;
    uint256 constant IC14y = 20117121134888397354874167684980275109670425748156006638162572660465418343003;
    
    uint256 constant IC15x = 15382977253084090384815842417452015392725969670925280739874866488758292245306;
    uint256 constant IC15y = 11621791496946985284424458054710550486990747847780096883669559352797791353714;
    
    uint256 constant IC16x = 12467618610393563322381442604170594282012139625548668861743073403315726453140;
    uint256 constant IC16y = 7092695368092559309853574785288004171247221630583937751559427829306224516028;
    
    uint256 constant IC17x = 10779861712723301829325132386316359653344626206483710479275461996150291564534;
    uint256 constant IC17y = 21806234906410643068950537402636355111031013865841036542515984189915911078852;
    
    uint256 constant IC18x = 7080659004722016265238941377972863056514612570706151607919462104048904083920;
    uint256 constant IC18y = 15330023073132894685259381402491971263553833357563528007930632586821997871996;
    
    uint256 constant IC19x = 15056171916085668464209847576907607194156099565525773153438364072983568025791;
    uint256 constant IC19y = 15249085621856289341621125428888004719935590094503550066825370520282101525661;
    
    uint256 constant IC20x = 3932247075323891492901207890357939238720407525931742984484939856485026977918;
    uint256 constant IC20y = 10641405527413552120430653231061451582423355095132448889162227572500524353642;
    
    uint256 constant IC21x = 3464378419412117005626190455910548268497763145896081273440353427643337213047;
    uint256 constant IC21y = 11771830611982241561963618832513654278183141777430254078818265338844173652609;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[21] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
