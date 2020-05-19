const {admin,db}=require('../util/admin');
const config=require('../util/config');

exports.getAllPosts=(req,res)=>{
    db
     .collection('posts')
     .orderBy('createdAt','desc')
     .get()
     .then((data)=>{
         let posts=[];
         data.forEach(doc=>{
             posts.push({
              postId: doc.id,
              title:doc.data().title,
              body: doc.data().body,
              location:doc.data().location,
              contact: doc.data().contact,
              userHandle: doc.data().userHandle,
              createdAt: doc.data().createdAt,
              commentCount: doc.data().commentCount,
              likeCount: doc.data().likeCount,
              postImage: doc.data().postImage
             });
         });
         return res.json(posts);
     })
     .catch((err)=>console.error(err));
}

exports.postOnePost=(req,res) => {
  
  const BusBoy=require('busboy');
  const path=require('path');
  const os = require('os');
  const fs=require('fs');

  const busboy=new BusBoy({headers:req.headers});

  let imageFileName;
  let imageToBeUploaded = {};
  let formData = new Map();
  busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
    if (mimetype !== 'image/jpeg' && mimetype !== 'image/png') {
      return res.status(400).json({ error: 'Wrong file type submitted' });
    }
    // my.image.png
    const imageExtension = filename.split('.')[filename.split('.').length - 1];
    // 645235423674523.png
    imageFileName = `${Math.round(
      Math.random() * 1000000000000
    )}.${imageExtension}`;
    const filepath = path.join(os.tmpdir(), imageFileName);
    imageToBeUploaded = { filepath, mimetype };
    file.pipe(fs.createWriteStream(filepath));
  });
  busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
    formData.set(fieldname, val);
    
  });
  busboy.on('finish', () => {
    admin
      .storage()
      .bucket(`${config.storageBucket}`)
      .upload(imageToBeUploaded.filepath, {
        resumable: false,
        metadata: {
          metadata: {
            contentType: imageToBeUploaded.mimetype
          }
        }
      })
      .then(() => {
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${
          config.storageBucket
        }/o/${imageFileName}?alt=media`;
        const newpost={
          title: formData.get('title'),
          body: formData.get('body'),
          location:req.user.location,
          contact: req.user.contact,
          userHandle: req.user.handle,
          postImage: imageUrl,
          createdAt: new Date().toISOString(),
          likeCount:0,
          commentCount:0
        };
        return db
          .collection('posts')
          .add(newpost)
          .then(doc=>{
            const respost = newpost;
            respost.postId = doc.id;
            res.json(respost);
        })
        .catch(err=>{
          res.status(500).json({error:"something went wrong"});
          console.error(err);
        })
      })
      .then(() => {
        return res.json({ message: 'Post uploaded successfully' });
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ error: err.code });
      });
  });
  busboy.end(req.rawBody); 
   
}

exports.getPost=(req,res)=>{
    let postData={};
    db.doc(`/posts/${req.params.postId}`).get()
        .then(doc=>{
            if(!doc.exists){
                return res.status(404).json({error: "post not found"});
            }
            postData=doc.data();
            postData.postId=doc.id;
            return db.collection('comments').orderBy('createdAt', 'desc').where('postId','==',req.params.postId).get();
        })
        .then(data=>{
            postData.comments = [];
            data.forEach((doc) => {
              postData.comments.push(doc.data());
            });
            return res.json(postData);
        })
        .catch((err) => {
            console.error(err);
            res.status(500).json({ error: err.code });
        });
};

exports.commentOnPost = (req, res) => {
    if (req.body.body.trim() === '')
      return res.status(400).json({ comment: 'Must not be empty' });
  
    const newComment = {
      body: req.body.body,
      createdAt: new Date().toISOString(),
      postId: req.params.postId,
      userHandle: req.user.handle,
      userImage: req.user.imageUrl
    };
    console.log(newComment);
  
    db.doc(`/posts/${req.params.postId}`)
      .get()
      .then((doc) => {
        if (!doc.exists) {
          return res.status(404).json({ error: 'post not found' });
        }
        return doc.ref.update({ commentCount: doc.data().commentCount + 1 });
        
      })
      .then(() => {
        return db.collection('comments').add(newComment);
      })
      .then(() => {
        res.json(newComment);
      })
      .catch((err) => {
        console.log(err);
        res.status(500).json({ error: 'Something went wrong' });
      });
  };
  exports.likePost = (req, res) => {
    const likeDocument = db
      .collection('likes')
      .where('userHandle', '==', req.user.handle)
      .where('postId', '==', req.params.postId)
      .limit(1);
  
    const postDocument = db.doc(`/posts/${req.params.postId}`);
  
    let postData;
  
    postDocument
      .get()
      .then((doc) => {
        if (doc.exists) {
          postData = doc.data();
          postData.postId = doc.id;
          return likeDocument.get();
        } else {
          return res.status(404).json({ error: 'post not found' });
        }
      })
      .then((data) => {
        if (data.empty) {
          return db
            .collection('likes')
            .add({
              postId: req.params.postId,
              userHandle: req.user.handle
            })
            .then(() => {
              postData.likeCount++;
              return postDocument.update({ likeCount: postData.likeCount });
            })
            .then(() => {
              return res.json(postData);
            });
        } else {
          return res.status(400).json({ error: 'post already liked' });
        }
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.code });
      });
  };
  
  exports.unlikePost = (req, res) => {
    const likeDocument = db
      .collection('likes')
      .where('userHandle', '==', req.user.handle)
      .where('postId', '==', req.params.postId)
      .limit(1);
  
    const postDocument = db.doc(`/posts/${req.params.postId}`);
  
    let postData;
  
    postDocument
      .get()
      .then((doc) => {
        if (doc.exists) {
          postData = doc.data();
          postData.postId = doc.id;
          return likeDocument.get();
        } else {
          return res.status(404).json({ error: 'post not found' });
        }
      })
      .then((data) => {
        if (data.empty) {
          return res.status(400).json({ error: 'post not liked' });
        } else {
          return db
            .doc(`/likes/${data.docs[0].id}`)
            .delete()
            .then(() => {
              postData.likeCount--;
              return postDocument.update({ likeCount: postData.likeCount });
            })
            .then(() => {
              res.json(postData);
            });
        }
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.code });
      });
  };
  // Delete a post
  exports.deletePost = (req, res) => {
    const document = db.doc(`/posts/${req.params.postId}`);
    document
      .get()
      .then((doc) => {
        if (!doc.exists) {
          return res.status(404).json({ error: 'post not found' });
        }
        if (doc.data().userHandle !== req.user.handle) {
          return res.status(403).json({ error: 'Unauthorized' });
        } else {
          return document.delete();
        }
      })
      .then(() => {
        res.json({ message: 'post deleted successfully' });
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ error: err.code });
      });
  };