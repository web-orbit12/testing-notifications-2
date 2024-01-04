import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit, useLoaderData } from "@remix-run/react";
import db from "../db.server"; // Assuming db is your Prisma client setup
import { Prisma } from '@prisma/client';
import {
  Page,
  Layout,
  Text,
  Badge,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Link,
  InlineStack,
  InlineGrid,
  TextField,
  useBreakpoints,
  Divider,
  InlineError 
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";


export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // Fetch SKUs from the database
  const skus = await db.productSKU.findMany();
  const emails = await db.email.findMany();
  const stockThreshold = await db.stockThreshold.findUnique({
    where: { id: 1 },
  });
  


  // Return both authentication and SKU data
  return json({ skus, emails, stockThreshold  });
};


export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  
  const productSKUs = formData.get('productSKU') || '';
  const emails = formData.get('email') || '';
  const minStockValue = formData.get('minStock');
  const minStock = minStockValue ? Number(minStockValue) : null;

  try {
    // Handle multiple SKUs separated by commas
    if (typeof productSKUs === 'string' && productSKUs.trim()) {
      const skuArray = productSKUs.split(',').map(s => s.trim()).filter(s => s);
      for (const sku of skuArray) {
        try {
          await db.productSKU.create({ data: { sku } });
        } catch (error: unknown) {
          const e = error as Error & { code?: string };
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
            throw e; // Only ignore unique constraint violations, rethrow other errors
          }
          // Log or handle the unique constraint violation if necessary
          console.log(`SKU ${sku} already exists.`);
        }
      }
    } 

    const emailErrors = []; // To track invalid emails

    // Handle multiple emails separated by commas
    if (typeof emails === 'string' && emails.trim()) {
      const emailArray = emails.split(',').map(e => e.trim()).filter(e => e);
      for (const email of emailArray) {

        if (!isValidEmail(email)) {
          emailErrors.push(email); // Add invalid email to the errors array
          continue; // Skip further processing for this email
        }

        try {
          await db.email.create({ data: { email } });
        } catch (error: unknown) {
          const e = error as Error & { code?: string };
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
            throw e; // Only ignore unique constraint violations, rethrow other errors
          }
          // Log or handle the unique constraint violation if necessary
          console.log(`Email ${email} already exists.`);
        }
      }
    }

    // Return the errors as part of the response if there are any
    if (emailErrors.length > 0) {
      return json({ emailErrors });
    }

    // Update or create minStock entry only if a valid number is provided
    if (minStock !== null && !isNaN(minStock)) {
      await db.stockThreshold.upsert({
        where: { id: 1 },
        update: { minStock },
        create: { minStock },
      });
    }


  } catch (error: unknown) {
    // Handle errors here
    const e = error as Error & { code?: string };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      console.log('There is a unique constraint violation, a new entry was not created');
    } else {
      throw e;
    }
  }

  return null; // or redirect to a success page
};




  
function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}   



export default function Index() {
  const nav = useNavigation();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const { smUp } = useBreakpoints();

  const [productSKUValue, setProductSKUValue] = useState('');
  const [emailValue, setEmailValue] = useState('');
  const [emailErrors, setEmailErrors] = useState<string[]>([]);
  const [minStockValue, setMinStockValue] = useState('');



  const handleEmailChange = (value: string) => {
    setEmailValue(value);
  
    // Split the input by commas and validate each email
    const emails = value.split(',').map(e => e.trim()).filter(e => e);
    const newEmailErrors = emails.filter(email => !isValidEmail(email));
  
    // Update the emailErrors state
    setEmailErrors(newEmailErrors);
  };
  

  useEffect(() => {
    // If the action returned errors, set them in state
    if (actionData?.emailErrors) {
      setEmailErrors(actionData.emailErrors);
    }
  }, [actionData]);

  const handleSaveClick = () => {
    // Create an object with the values from the state
    const productInfo = {
      productSKU: productSKUValue,
      email: emailValue,
      minStock: minStockValue,
    };
  
    // Use 'submit' to send data to the server
    submit(productInfo, { method: 'post' });
  };

  const { skus, emails, stockThreshold } = useLoaderData(); // Use the data from the loader

  return (
    <Page>
      <ui-title-bar title="Settings">
        <button variant="primary"  onClick={handleSaveClick}>
          Sauvegarder
        </button>
      </ui-title-bar>
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: "1fr", md: "2fr 5fr" }} gap="400">
          <Box
            as="section"
            paddingInlineStart={{ xs: '400', sm: '0' }}
            paddingInlineEnd={{ xs: '400', sm: '0' }}
          >
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd"> SKU Produit</Text>
              <Text as="p" variant="bodyMd"> Entrez les SKU des produits concernés par les alertes, séparés par des virgules.</Text>
            </BlockStack>
          </Box>
          <Card roundedAbove="sm">
            <BlockStack gap="400">
              <TextField
                label="Product SKU"
                name="productSKU"
                value={productSKUValue}
                onChange={(value) => setProductSKUValue(value)}
                autoComplete="off"
              />
              <div style={{ marginBottom: '1rem' }}>
                {skus.map((sku: { id: React.Key | null | undefined; sku: string | undefined; }) => (
                  <Badge key={sku.id} tone="success">
                    {sku.sku}
                  </Badge>
                ))}
              </div>
            </BlockStack>
          </Card>
        </InlineGrid>

        <InlineGrid columns={{ xs: "1fr", md: "2fr 5fr" }} gap="400">
          <Box
            as="section"
            paddingInlineStart={{ xs: '400', sm: '0' }}
            paddingInlineEnd={{ xs: '400', sm: '0' }}
          >
            <BlockStack gap="400">

              <Text as="h3" variant="headingMd"> Champ Email</Text>
              <Text as="p" variant="bodyMd"> Saisissez les adresses e-mail pour recevoir les notifications, séparées par des virgules.</Text>

            </BlockStack>
          </Box>
          <Card roundedAbove="sm">
            <BlockStack gap="400">


              <TextField
                label="Email"
                name="email"
                value={emailValue}
                onChange={handleEmailChange}
                autoComplete="off"
                error={emailErrors.length > 0}
              />

              {/* Displaying inline errors for email */}
              {emailErrors.map((error, index) => (
                <InlineError key={index} message={`Invalid email format: ${error}`} fieldID="emailField" />
              ))}

              <div style={{ marginBottom: '1rem' }}>
                {emails.map((email: { id: React.Key | null | undefined; email: string | undefined; }) => (
                  <Badge key={email.id} tone="success">
                    {email.email}
                  </Badge>
                ))}
              </div>

            </BlockStack>
          </Card>
        </InlineGrid>

        <InlineGrid columns={{ xs: "1fr", md: "2fr 5fr" }} gap="400">
          <Box
            as="section"
            paddingInlineStart={{ xs: '400', sm: '0' }}
            paddingInlineEnd={{ xs: '400', sm: '0' }}
          >
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd"> Champ Seuil de Stock</Text>
              <Text as="p" variant="bodyMd"> Indiquez le seuil de stock minimum. Si le stock d'un produit descend en dessous de ce nombre, une notification sera envoyée. Exemple : 20. Le seuil s'applique à tous les produits listés.</Text>
            </BlockStack>
          </Box>
          <Card roundedAbove="sm">
            <BlockStack gap="400">

              <TextField
                label="Seuil de stock"
                name="minStock"
                value={minStockValue}
                onChange={(value) => setMinStockValue(value)}
                autoComplete="off"
              />
              {/* Display the current stock threshold value */}

              {stockThreshold && (
                <div style={{ marginTop: '0.5rem' }}>
                  <Badge tone="info">{stockThreshold.minStock}</Badge>
                </div>
              )}

            </BlockStack>
          </Card>
        </InlineGrid>


        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={handleSaveClick}>
            Sauvegarder
          </Button>
        </div>

      </BlockStack>
    </Page>
  );
}
