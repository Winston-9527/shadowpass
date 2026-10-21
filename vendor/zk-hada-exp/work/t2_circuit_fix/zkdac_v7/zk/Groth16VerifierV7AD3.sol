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

contract Groth16VerifierV7AD3 {
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
    uint256 constant deltax1 = 14800730044628668100585648371233839411240361717969000450186692787809446146245;
    uint256 constant deltax2 = 10157200074340780211268522830815551241281670139975749114275601946764415694522;
    uint256 constant deltay1 = 18707525098186658320440592683593416833383781496071757824308751490791074364217;
    uint256 constant deltay2 = 19837133222010008500329266631502238376132789913285779453479482264996730472506;

    
    uint256 constant IC0x = 751493486217052412383000214379771540561097957916844394282829156675496047546;
    uint256 constant IC0y = 3526270982232276286810659858942246222533585966167737705601028611853903938193;
    
    uint256 constant IC1x = 377051301101062551369427699869536394563244751396145753520870332485312408489;
    uint256 constant IC1y = 2666021372917801195216665665245988578572853275192594900993030340248690712207;
    
    uint256 constant IC2x = 4456504982110287552865984771243172075430261471274688117748204685423643544787;
    uint256 constant IC2y = 14943400325385282248659603075237245962240990419209639346623813865461744484621;
    
    uint256 constant IC3x = 749396448716342107750683875933457719587222044744178850768197577602726649678;
    uint256 constant IC3y = 17164688496956881154963532712066039085637077692996418458490925866527772764497;
    
    uint256 constant IC4x = 13824120449497613298890432296387535516982671540865429242150323633357872942049;
    uint256 constant IC4y = 13615765949688904539615101860117286889182323929858148546293423590582635438992;
    
    uint256 constant IC5x = 5321725947308586193161297998249120327843779991362592485930550827305701933338;
    uint256 constant IC5y = 547349261150811085782010498178562856138399344392642926513797310075214975406;
    
    uint256 constant IC6x = 14385357385535888672601287937688145748576009534942275342415950142562184385569;
    uint256 constant IC6y = 10812329882892786627577678148606400747973761360638589571531142090393306714509;
    
    uint256 constant IC7x = 6556544795553932186421727934934486371695081199999428521233198781646844728230;
    uint256 constant IC7y = 162049531170395577330306691410096189162628077283245536910800685068727136092;
    
    uint256 constant IC8x = 4199711129404400420592116274826255050327822275789571249628002747257301913461;
    uint256 constant IC8y = 21605772514736921282657130413255262568254769373512802192829529841021264660330;
    
    uint256 constant IC9x = 6318145045086336436031716301236121644686017194810810579406632620799961055411;
    uint256 constant IC9y = 16875530930859488540914963855368798005230928186017777901185360809918915617747;
    
    uint256 constant IC10x = 7519902974799599732807926001742897654065402196813057557322283985662454948543;
    uint256 constant IC10y = 10601806841648717005405826961865314345975966085081659441885379609018886297217;
    
    uint256 constant IC11x = 19387810997795644356613964440694140729179677295330837161399249258217524542103;
    uint256 constant IC11y = 20831843574227762975085126265953151955537104697636201072874228708104380628496;
    
    uint256 constant IC12x = 20820757789999112914568032967026610716069099359394327152851495685772630971775;
    uint256 constant IC12y = 11521865462235140782755653312564833116452408187789928131528120067135047078960;
    
    uint256 constant IC13x = 710463341813325313537050985285868594446749419654951628959735160967708535749;
    uint256 constant IC13y = 10124867634100576291495638187027666254880688237236642272535755738122711703858;
    
    uint256 constant IC14x = 4284922820963969700973999857157945285747949779004360891117749602972605519239;
    uint256 constant IC14y = 693272789897800657727054869460097907647587616972975022266200286966903293585;
    
    uint256 constant IC15x = 3877450301903200801346221570399818763860030539491680028747709952971209473170;
    uint256 constant IC15y = 5526072198946717720515753639724119708137303033949624939423764406612582969545;
    
    uint256 constant IC16x = 8678373738558396528435837524847073087845926728730042659916764172120784019868;
    uint256 constant IC16y = 11682728297568346701261261490498203318815081944397464530414096551996504358581;
    
    uint256 constant IC17x = 16826972773085027174495589569975334644314418423531018093960496563968010180672;
    uint256 constant IC17y = 893312995737168499509031885045917044738049267521182346947953939430139677527;
    
    uint256 constant IC18x = 19534295016843505181520076774648496164992063492171294724352979458098421740466;
    uint256 constant IC18y = 17197722384001777392611480548425905424069191892322589831830590209180662087942;
    
    uint256 constant IC19x = 16513787732643153367503470555201508925519965426295854229663864942659686269074;
    uint256 constant IC19y = 2388936651996887861758034615478258119064103179925262344864688398637866140727;
    
    uint256 constant IC20x = 7672708005910215645855483769560183788875690306750900725047608201258812908599;
    uint256 constant IC20y = 9020890870673815853580352222795678509882184667566472742212460495109141616283;
    
    uint256 constant IC21x = 13770886493386985683344345133189297150021320934056826203667764298029008945688;
    uint256 constant IC21y = 9764858937038221559512523425155242578368220705559145850509962893227076300481;
    
    uint256 constant IC22x = 15158565776397618085630419851308462018138292767524351457915398864359300722550;
    uint256 constant IC22y = 17853845425430878586778304107356810715443163769991582749099178668885713890706;
    
    uint256 constant IC23x = 94369710307152029179428015545896445317319795217913034875142871762940971187;
    uint256 constant IC23y = 15593706750692757699823341822003170340694549151324184826789760162366758052403;
    
    uint256 constant IC24x = 20032896742572965823513514469962798292496431978398508702104612090260974672795;
    uint256 constant IC24y = 18482651317617291571195535050001534686079793142412358581482526026109232047251;
    
    uint256 constant IC25x = 7578032848768732798435938134388402072581311821013949973621663259775089087891;
    uint256 constant IC25y = 5658699915519473309903190760597650464542791112562661799485942567036216609524;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[25] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
