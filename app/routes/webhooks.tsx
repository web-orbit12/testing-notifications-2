import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { JSONValue } from "node_modules/@shopify/shopify-app-remix/build/ts/server/types";
import nodemailer from 'nodemailer';


// Configure your SMTP transporter
const transporter = nodemailer.createTransport({
  host: 'mail.digitalmonstr.com',
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: 'test@digitalmonstr.com', // your email
    pass: 'V=y]AIs=dr6s' // your password
  }
});

// Define the email sending function
async function sendNotificationEmail(stockItem: { available: any; inventory_item_id: any; }, recipientEmails: any[]) {
  const mailOptions = {
    from: '"Stock Alert" <test@digitalmonstr.com>', // sender address
    to: recipientEmails.join(','), // list of receivers
    subject: `Stock Alert: Item ${stockItem.inventory_item_id}`,
    text: `The stock for item ${stockItem.inventory_item_id} is below threshold. Items remaining: ${stockItem.available}`, // plain text body
    html: `<b>The stock for item ${stockItem.inventory_item_id} is below threshold. Items remaining: ${stockItem.available}</b>`
  };

  try {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.log(error);
      }
      console.log('Message sent: %s', info.messageId);
    });
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(
    request
    );

  if (!admin) {
    // If the admin context isn't available, it might mean the shop was uninstalled
    return new Response("Shop not found or uninstalled", { status: 404 });
  }

function safeParseJSON(jsonString: JSONValue | object) {
  if (typeof jsonString === 'string') {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error("Error parsing JSON:", error);
      return null;
    }
  } else {
    // If it's not a string, just return it as is
    return jsonString;
  }
}



  try {
    switch (topic) {
      case "APP_UNINSTALLED":
        if (session) {
          await db.session.deleteMany({ where: { shop } });
          console.log("SESSION DELETED");
        }
        break;
      case "PRODUCTS_CREATE":
        console.log("ITEM CREATED");
        break;
      case "PRODUCTS_DELETE":
        console.log("ITEM DELETED");
        break;
      case "INVENTORY_LEVELS_UPDATE":
        console.log("STOCK UPDATE TRIGGERED");

        // Try to safely parse the payload
        const inventoryData = safeParseJSON(payload);
        console.log("Parsed Payload:", inventoryData);

        if (inventoryData && typeof inventoryData === 'object') {
          const stockThresholdEntry = await db.stockThreshold.findUnique({
            where: { id: 1 } // Assuming the threshold is stored with id 1
          });
      
          if (!stockThresholdEntry) {
            console.error("Stock threshold entry not found in database");
            break;
          }
      
          const stockThreshold = stockThresholdEntry.minStock;
          const { available, inventory_item_id } = inventoryData;

          // Check if the inventory level is below the threshold
          if (available < stockThreshold) {
            console.log(`Inventory for item ${inventory_item_id} is below threshold: ${available}`);
            console.log(`Stock threshold: ${stockThreshold}` );
           
            // Add more logic here if needed, e.g., sending alerts
            const emailEntries = await db.email.findMany();
            const recipientEmails = emailEntries.map(entry => entry.email);
            console.log( "recipientEmails " + recipientEmails.join(',') );
            await sendNotificationEmail({ available, inventory_item_id }, recipientEmails);
          }
        } else {
          console.error("Invalid or unexpected inventory data format");
        }
        break;

      case "CUSTOMERS_DATA_REQUEST":
      case "CUSTOMERS_REDACT":
      case "SHOP_REDACT":
        // Handle other webhook topics as needed
        break;
      default:
        return new Response("Unhandled webhook topic", { status: 404 });
    }

    // Return a success response for successfully processed webhook
    return json({ success: true });

  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
