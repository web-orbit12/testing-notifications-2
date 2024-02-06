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

  // Try to safely parse the payload
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

        const inventoryData = safeParseJSON(payload);
        if (!inventoryData || typeof inventoryData !== 'object') {
          console.error("Invalid or unexpected inventory data format");
          break;
        }

        const { available, inventory_item_id } = inventoryData;

        // Faire une requête GraphQL pour obtenir le SKU
        const graphqlResponse = await admin.graphql(`
            {
              inventoryItem(id: "gid://shopify/InventoryItem/${inventory_item_id}") {
                variant {
                  sku
                }
              }
            }
          `);

        // Convertir la réponse en JSON
        const jsonResponse = await graphqlResponse.json();

        // Accéder aux données de la réponse
        const sku = jsonResponse.data.inventoryItem.variant.sku;

        // Vérifier si le SKU est surveillé dans la base de données
        const skuEntry = await db.productSKU.findUnique({
          where: { sku }
        });

        if (!skuEntry) {
          console.log(`SKU ${sku} not monitored.`);
          break;
        }

        // Vérifier si le niveau de stock est en dessous du seuil
        const stockThresholdEntry = await db.stockThreshold.findUnique({
          where: { id: 1 }
        });

        // Vérifiez que stockThresholdEntry n'est pas null avant de continuer
        if (!stockThresholdEntry) {
          console.error("No stock threshold entry found in the database.");
          break; // Sortez du case si aucun seuil de stock n'est trouvé
        }

        // À ce stade, stockThresholdEntry est garanti de ne pas être null
        if (available < stockThresholdEntry.minStock) {
          console.log(`Inventory for SKU ${sku} is below threshold: ${available}`);

          // Récupérer les entrées d'email de la base de données
          const emailEntries = await db.email.findMany();
          const recipientEmails = emailEntries.map(entry => entry.email);

          // Envoyer l'email de notification
          await sendNotificationEmail({ available, inventory_item_id: sku }, recipientEmails);
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
