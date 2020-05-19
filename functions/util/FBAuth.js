const {admin,db}=require('./admin')

module.exports=(req,res,next)=>{
    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer ')){
        idToken=req.headers.authorization.split('Bearer ')[1];
    }
    else return res.status(403).json({error: 'unauthorized'})
    admin
    .auth()
    .verifyIdToken(idToken)
    .then((decodedToken) => {
      req.user = decodedToken;
      console.log(decodedToken);
      return db
        .collection('users')
        .where('userId', '==', req.user.uid)
        .limit(1)
        .get();
    })
    .then((data) => {
      req.user.handle = data.docs[0].data().handle;
      req.user.imageUrl = data.docs[0].data().imageUrl;
      req.user.location = data.docs[0].data().location;
      req.user.contact = data.docs[0].data().contact;
      return next();
    })
    .catch((err) => {
      console.error('Error while verifying token ', err);
      return res.status(403).json(err);
    });
}