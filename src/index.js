import 'dotenv/config';
import express from "express";
import cors from "cors";
import documentRoutes from "./routes/documents.routes.js";

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json());

// Rutas API
app.use("/api/documents", documentRoutes);


export default app;