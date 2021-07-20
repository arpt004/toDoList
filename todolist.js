const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const _ = require("lodash");
const ejs = require("ejs");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require("bcrypt");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");
const date = require(__dirname+"/date.js")

const app = express();
//app.use(express.static("public"));
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true}));
app.set("view engine", "ejs");
mongoose.set('useFindAndModify', false);

const CLIENT_ID="480466191443-kuaabf6nu2necei04o05h2401ghhqkiv.apps.googleusercontent.com"
const CLIENT_SECRET="1DxFuYDIiEm-EODTJ6Tg3HwI"
var gId = ""
var displayName = ""

//Session should be before mongoose.connect and after app.use function
app.use(session({
    secret:"little secret",
    resave: false,
    saveUninitialized: false
}))
app.use(passport.initialize());
app.use(passport.session())

//to connect to mongoose
//const url = "mongodb://localhost:27017/todolistDB"  --> offline
// Online
const url = "mongodb+srv://admin-todolist:todolist@cluster0.jv4fj.mongodb.net/todolistDB"
mongoose.connect(url, {useNewUrlParser: true, useUnifiedTopology: true} );
mongoose.set('useCreateIndex', true);

//Schema and model for User table
const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    googleId: String,
    fullName: String
});
userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);
// requires the model with Passport-Local Mongoose plugged in
//const User = require('./models/user');
const User = new mongoose.model("user", userSchema);

// The createStrategy is responsible to setup passport-local LocalStrategy with the correct options.
passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
    done(null, user.id);
  });
  
passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
        //done(err, user);
        done(err, true);
    });
});

//Schema and model for Item table
const itemSchema = new mongoose.Schema({
    name: String
});
const Item = mongoose.model("Item", itemSchema);

//Schema and model for lists table
const listSchema = {
    name : String,
    items : [itemSchema]
}
const List = mongoose.model("List", listSchema);

// items
const item1 = new Item({
    name : "Welcome to  your todolist"
});

const defaultItems = [item1];

// Passport google Auth
passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    // callbackURL: "http://localhost:3000/auth/google/secrets",
    callbackURL: "https://shrouded-depths-00499.herokuapp.com/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    //console.log(profile) 
    gId = profile.id
    displayName = profile.displayName
    console.log(profile)
    User.findOrCreate({ googleId: profile.id, username: profile.id, fullName:profile.displayName}, function (err, user) {
      return cb(err, user);
    });
  }
));


//get request
app.get("/", function(req, res){
    res.render("login")
});
app.get("/register", function(req, res){
    res.render("register")
});
app.get("/success/:customListName", function(req, res){
    let day = req.params.customListName;

    console.log("i am in success -->" + req.isAuthenticated())
    if(req.isAuthenticated()){
        console.log(req.user)
        console.log("i am inside success "+day)
        //res.render("success")
        List.findOne({name:day}, function(err, foundList){
            if(err){
                console.log(err)
            }else{
                if(foundList){
                    console.log("i am inside foundList ")
                    res.render("list", {listTitle :day, newItem :foundList.items, dpn:displayName});
                }else{
                    let newList = new List({
                        name: day,
                        items: defaultItems
                    });
                    newList.save() 
                    console.log("i am outside foundList")                   
                    res.redirect("/success/"+day)
                }
            }
        }) 
    }else{
        console.log("i am outside success")
        res.redirect("/")
    }    
});
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] }));

app.get('/auth/google/secrets', 
  passport.authenticate('google', { failureRedirect: '/' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/success/'+gId);
});


//post request
app.post("/", function(req, res){    
    const user = new User({
        username: req.body.email,
        password: req.body.password
    })

    req.login(user, function(err){
        if(err){
            console.log(err)
        }
        else{
            var authenticate = User.authenticate();
            authenticate(user.username, user.password, function(err, result){
                if(!err){
                    if(result){
                        console.log(" i am authenticated "+ result);
                        console.log("i am in login -->" + req.isAuthenticated())
                        displayName = result.fullName
                        res.redirect("/success/"+result.username) 
                    }else{
                        console.log("Incorrect username or password")
                        res.redirect("/") 
                    }                    
                }else{
                    console.log("error in User authentication part")
                }              
            })
        }
    })
});

app.post("/register", function(req, res){

    User.register({username: req.body.email, fullName: req.body.fullName}, 
                    req.body.password, 
                    function(err, user){
        if(err){
            res.redirect("/register")
        }else{
            res.redirect("/") 
        }
    })
});

app.post("/success/:customListName", function(req, res){
    let day = req.params.customListName;

    let reqItem = req.body.item;
    let list = req.body.list;

    let itemInsert = new Item({
        name: reqItem
    })

    List.findOne({name: day}, function(err, foundResult){
        if(!err){
            foundResult.items.push(itemInsert);
            foundResult.save();
            res.redirect("/success/"+list);
        }else{
            console.log(err)
        }
    })
})

app.post("/success", function(req, res){
    req.logout();
    res.render("login")
});

// to handle post delete request from all pages
app.post("/delete", function(req, res){
    let itemDeleteId = req.body.tick
    let findList = req.body.hiddenInput

    // findOneAndUpdate ({findOne}, {update} , {callBack})
    List.findOneAndUpdate({name: findList}, // In list table name is lists and items is array
        {$pull : {items : {_id:itemDeleteId}}}, //to delete one item from array using id,here we pull from items array
        function(err, foundToDelete){
            if(!err){
                res.redirect("/success/"+findList);
            }
        }
    )
    
});

// to start the server
let port = process.env.PORT;
if(port == null || port == ""){
    port = 3000;
}
app.listen(port, function(){
    console.log("Server has started successfully")
})