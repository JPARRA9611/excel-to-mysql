import express from "express";
import path from "path";
import { create } from "express-handlebars";
import multer from "multer";
//INITIALIZATIONS
const app = express();
app.set("PORT", process.env.PORT || 3000);
app.set("views", path.join(__dirname, "views"));

const exphbs = create({
  defaultLayout: "main",
  layoutsDir: path.join(app.get("views"), "layouts"),
  partialsDir: path.join(app.get("views"), "partials"),
  extname: ".hbs"
})

app.engine(".hbs",exphbs.engine);
app.set("view engine", ".hbs");
// MIDDLEWARES
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(express.json({limit: '50mb'}));
const storage = multer.diskStorage({
  destination: path.join(__dirname, "public/uploads"),
  filename: (req, file, cb) => {
    cb(null, new Date().getTime() + path.extname(file.originalname));
  },
});
app.use(multer({ storage }).single("file"));

// ROUTES
app.get("/", (req, res) => {
  res.render("home");
});



app.use('/process',require('./src/routes/guides/guides'));
app.use(express.static(path.join(__dirname,'public')))
export default app;
