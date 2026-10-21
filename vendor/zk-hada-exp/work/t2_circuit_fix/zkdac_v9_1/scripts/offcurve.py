# From audit issue #53 (verbatim logic): find an off-curve point A on Baby Jubjub's twisted-Edwards addition law with 8*A = q*B8, q known.
import random, json, sys
p=21888242871839275222246405745257275088548364400416034343698204186575808495617
l=2736030358979909402780800718157159386076813972158567259200215660948447373041
a=168700; d=168696
B8=(5299619240641551281634865583518297030282874472190772894086521144482721001553,16950150798460657717958625567821834550301663161624707787222815936182638968203)
inv=lambda x: pow(x%p,p-2,p)
def add(P,Q):
    x1,y1=P;x2,y2=Q;t=d*x1*x2*y1*y2%p
    return ((x1*y2+y1*x2)*inv(1+t)%p, (y1*y2-a*x1*x2)*inv(1-t)%p)
def mul(k,P):
    R=(0,1)
    while k:
        if k&1:R=add(R,P)
        P=add(P,P);k>>=1
    return R
oncurve=lambda P:(a*P[0]**2+P[1]**2-1-d*P[0]**2*P[1]**2)%p==0
# poly utils, coeff lists low->high
def norm(f):
    f=[c%p for c in f]
    while f and f[-1]==0:f.pop()
    return f
def pmul(f,g):
    r=[0]*(len(f)+len(g)-1) if f and g else []
    for i,x in enumerate(f):
        for j,y in enumerate(g): r[i+j]=(r[i+j]+x*y)%p
    return norm(r)
def pdivmod(f,g):
    f=norm(f[:]);g=norm(g);q=[0]*max(len(f)-len(g)+1,1);ig=inv(g[-1])
    while len(f)>=len(g) and f:
        c=f[-1]*ig%p;s=len(f)-len(g);q[s]=c
        for i,y in enumerate(g): f[s+i]=(f[s+i]-c*y)%p
        f=norm(f)
    return norm(q),f
pmod=lambda f,g:pdivmod(f,g)[1]
def pgcd(f,g):
    f,g=norm(f),norm(g)
    while g:f,g=g,pmod(f,g)
    return [c*inv(f[-1])%p for c in f] if f else f
def ppow(b,e,m):
    r=[1];b=pmod(b,m)
    while e:
        if e&1:r=pmod(pmul(r,b),m)
        b=pmod(pmul(b,b),m);e>>=1
    return r
def psub(f,g):
    n=max(len(f),len(g));return norm([(f[i] if i<len(f) else 0)-(g[i] if i<len(g) else 0) for i in range(n)])
def roots(f):
    f=norm(f);xp=ppow([0,1],p,f);g=pgcd(f,psub(xp,[0,1]))
    out=[];stack=[g]
    while stack:
        h=stack.pop()
        if len(h)<=1:continue
        if len(h)==2: out.append((-h[0])*inv(h[1])%p);continue
        while True:
            dl=random.randrange(p);s=psub(ppow([dl,1],(p-1)//2,h),[1]);k=pgcd(h,s)
            if 1<len(k)<len(h): stack+= [k,pdivmod(h,k)[0]];break
    return out
def sqrt(n):
    n%=p
    if n==0:return 0
    if pow(n,(p-1)//2,p)!=1:return None
    q,s=p-1,0
    while q%2==0:q//=2;s+=1
    z=2
    while pow(z,(p-1)//2,p)!=p-1:z+=1
    m,c,t,r=s,pow(z,q,p),pow(n,q,p),pow(n,(q+1)//2,p)
    while t!=1:
        i,t2=0,t
        while t2!=1:t2=t2*t2%p;i+=1
        b=pow(c,1<<(m-i-1),p);m=i;c=b*b%p;t=t*c%p;r=r*b%p
    return r
random.seed(int(sys.argv[1]) if len(sys.argv)>1 else 1)
for trial in range(200):
    q=random.randrange(1,l); Q=mul(q,B8); P2=mul(q*pow(4,-1,l)%l,B8)
    assert add(add(P2,P2),add(P2,P2))==Q
    X,Y=P2
    den=[1,Y*d%p]; t=[Y,a]  # Y + a u
    lhs=pmul(pmul([0,4],t),den)
    inner=norm([den[0]+0, (den[1]+d*Y)%p, d*a%p])
    rhs=pmul([X*X%p],pmul(inner,inner))
    f=psub(lhs,rhs)
    for u in roots(f):
        dd=(1+Y*d*u)%p
        if dd==0:continue
        v=(Y+a*u)*inv(dd)%p
        x0,y0=sqrt(u),sqrt(v)
        if x0 is None or y0 is None:continue
        for x in (x0,p-x0):
            for y in (y0,p-y0):
                A=(x,y)
                if add(A,A)==P2 and not oncurve(A):
                    A8=add(add(add(A,A),add(A,A)),add(add(A,A),add(A,A)))
                    assert add(add(add(A,A),add(A,A)),add(add(A,A),add(A,A)))==Q
                    print(json.dumps({"q":str(q),"Ax":str(x),"Ay":str(y),"Qx":str(Q[0]),"Qy":str(Q[1]),"trial":trial}));sys.exit(0)
print("none")
