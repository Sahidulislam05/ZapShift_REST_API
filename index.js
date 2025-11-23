import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import Stripe from "stripe";
import crypto from "crypto";
import admin from "firebase-admin";
// console.log("Stripe Secret Key:", process.env.STRIPE_SECRET);
const stripe = new Stripe(process.env.STRIPE_SECRET);
// const stripe = require("stripe")(process.env.STRIPE_SECRET);
const app = express();
const port = process.env.PORT || 3000;

// var admin = require("firebase-admin");
import serviceAccount from "./zap-shift-service-firebase-admin-sdk.json" with { type: "json" };
// var serviceAccount = require("./zap-shift-service-firebase-admin-sdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware

app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({
      message: "Unauthorized access",
    });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).json({
      message: "Unauthorized access",
    });
  }
};

// Tracking Id

function generateTrackingId() {
  const prefix = "ZAP";
  const timePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${timePart}-${randomPart}`;
}

// console.log(generateTrackingId());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@sahidul-islam.zbcwnr8.mongodb.net/?appName=Sahidul-Islam`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("zap_shift");
    const userCollection = db.collection("users");
    const parcelCollection = db.collection("parcels");
    const paymentCollection = db.collection("payments");
    const ridersCollection = db.collection("riders");

    // User REST API

    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        user.role = "user";
        user.createdAt = new Date();
        const email = user.email;
        const userExist = await userCollection.findOne({ email });
        if (userExist) {
          return res.json({
            message: "User already added",
          });
        }
        const result = await userCollection.insertOne(user);
        res.status(201).json({
          message: "User added",
          result,
        });
      } catch (error) {
        res.status(404).json({
          message: "User not added",
          error,
        });
      }
    });

    // Parcel API

    app.get("/parcels", async (req, res) => {
      try {
        const query = {};
        const { email } = req.query;
        if (email) {
          query.senderEmail = email;
        }
        const options = { sort: { createdAt: -1 } };
        const cursor = parcelCollection.find(query, options);
        const result = await cursor.toArray();
        res.status(201).json({
          message: "Data found",
          result,
        });
      } catch (error) {
        res.status(401).json({
          message: "Data not found",
          error,
        });
      }
    });

    app.get("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await parcelCollection.findOne(query);
        res.status(201).json({
          message: "Data found successfully!",
          result,
        });
      } catch (error) {
        res.status(401).json({
          message: "Failed to found Data!",
          error,
        });
      }
    });

    app.post("/parcels", async (req, res) => {
      try {
        const parcel = req.body;
        parcel.createdAt = new Date();
        const result = await parcelCollection.insertOne(parcel);
        res.status(201).json({
          message: "Data insert successfully!",
          result,
        });
      } catch (error) {
        res.status(401).json({
          message: "Failed to insert Data!",
          error,
        });
      }
    });

    app.delete("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await parcelCollection.deleteOne(query);
        res.status(200).json({
          message: "Data delete successfully!",
          result,
        });
      } catch (error) {
        res.status(500).json({
          message: "Failed to delete Data!",
          error,
        });
      }
    });

    // Payment API

    app.post("/payment-checkout-session", async (req, res) => {
      try {
        const paymentInfo = req.body;
        const amount = parseInt(paymentInfo.cost) * 100;
        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "USD",
                unit_amount: amount,
                product_data: {
                  name: `Please pay for: ${paymentInfo.parcelName}`,
                },
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          metadata: {
            parcelId: paymentInfo.parcelId,
            parcelName: paymentInfo.parcelName,
          },
          customer_email: paymentInfo.senderEmail,
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
        });
        res.status(200).json({
          message: "Payment successfully!",
          url: session.url,
        });
      } catch (error) {
        res.status(401).json({
          message: "Failed to Payment!",
          error,
        });
      }
    });

    // Old Method
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const paymentInfo = req.body;
        const amount = parseInt(paymentInfo.cost) * 100;
        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "USD",
                unit_amount: amount,
                product_data: {
                  name: paymentInfo.parcelName,
                },
              },
              quantity: 1,
            },
          ],
          customer_email: paymentInfo.senderEmail,
          metadata: {
            parcelId: paymentInfo.parcelId,
          },
          mode: "payment",
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
        });
        res.status(200).json({
          message: "Payment successfully!",
          url: session.url,
        });
      } catch (error) {
        res.status(401).json({
          message: "Failed to Payment!",
          error,
        });
      }
    });

    app.patch("/payments-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        // console.log("session", session);

        const transactionId = session.payment_intent;
        const query = { transactionId: transactionId };
        const paymentExist = await paymentCollection.findOne(query);
        if (paymentExist) {
          return res.status(401).json({
            message: "Already exist!",
            transactionId,
            trackingId: paymentExist.trackingId,
          });
        }

        const trackingId = generateTrackingId();
        if (session.payment_status === "paid") {
          const id = session.metadata.parcelId;
          const query = { _id: new ObjectId(id) };
          const update = {
            $set: {
              paymentStatus: "paid",
              trackingId: trackingId,
            },
          };
          const result = await parcelCollection.updateOne(query, update);
          const payment = {
            amount: session.amount_total / 100,
            currency: session.currency,
            customerEmail: session.customer_email,
            parcelId: session.metadata.parcelId,
            parcelName: session.metadata.parcelName,
            transactionId: session.payment_intent,
            paymentStatus: session.payment_status,
            paidAt: new Date(),
            trackingId: trackingId,
          };
          if (session.payment_status === "paid") {
            const resultPayment = await paymentCollection.insertOne(payment);
            res.status(200).json({
              message: "Payment verified and get transaction id!",
              modifyParcel: result,
              trackingId: trackingId,
              transactionId: session.payment_intent,
              paymentInfo: resultPayment,
            });
          }
        }
      } catch (error) {
        res.status(401).json({
          message: "Failed to verified!",
          error,
        });
      }
    });

    // Payment history

    app.get("/payments", verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email;
        const query = {};
        // console.log("headers", req.headers);
        if (email) {
          query.customerEmail = email;
          if (email !== req.decoded_email) {
            return res.status(403).json({
              message: "Forbidden access",
            });
          }
        }
        const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
        const result = await cursor.toArray();
        res.status(201).json({
          message: "Data found",
          result,
        });
        // res.send(result);
      } catch (error) {
        res.status(401).json({
          message: "Data not found",
          error,
        });
      }
    });

    // Riders REST API

    app.get("/riders", async (req, res) => {
      try {
        const query = {};
        if (req.query.status) {
          query.status = req.query.status;
        }
        const cursor = ridersCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(401).json({
          message: "Data not found",
          error,
        });
      }
    });

    app.post("/riders", async (req, res) => {
      try {
        const rider = req.body;
        rider.status = "pending";
        rider.createdAt = new Date();
        const result = await ridersCollection.insertOne(rider);
        res.send(result);
      } catch (error) {
        res.status(401).json({
          message: "Data not found",
          error,
        });
      }
    });

    app.patch("/riders/:id", verifyFBToken, async (req, res) => {
      try {
        const status = req.body.status;
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateDOC = {
          $set: {
            status: status,
          },
        };
        const result = await ridersCollection.updateOne(query, updateDOC);

        if (status === "approved") {
          const email = req.body.email;
          const useQuery = { email };
          const updateUser = {
            $set: {
              role: "rider",
            },
          };
          const userResult = await ridersCollection.updateOne(
            useQuery,
            updateUser
          );
        }

        res.send(result);
      } catch (error) {
        res.status(401).json({
          message: "Data not found",
          error,
        });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("ZapShift running!");
});

app.listen(port, () => {
  console.log(`ZapShift app listening on port ${port}`);
});
