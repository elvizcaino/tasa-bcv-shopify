// full-sync-bcv.ts

async function ejecutarSincronizacionTotal() {
    console.log(`Iniciando flujo de trabajo: ${new Date().toLocaleString()}`);

    // --- CONFIGURACIÓN ---
    const config = {
        dolarApiUrl: "https://ve.dolarapi.com/v1/dolares/oficial",
        hasuraGqlUrl: "https://special-macaw-38.hasura.app/v1/graphql",
        hasuraSecret: process.env.HASURA_SECRET,
        shopifyDomain: "kmdadn-qr.myshopify.com",
        shopifyToken: process.env.SHOPIFY_TOKEN,
        markup: 1.30 // +30%
    };

    try {
        // PASO 1: Obtener tasa oficial del día
        console.log("1. Obteniendo datos de Dolar API...");
        const resDolar = await fetch(config.dolarApiUrl);
        const dataDolar: any = await resDolar.json();

        const { moneda, fuente, promedio } = dataDolar;
        console.log(`--> Tasa oficial detectada: ${promedio} ${moneda} (${fuente})`);

        // PASO 2: Insertar en Hasura (GraphQL Mutation)
        console.log("2. Insertando datos en tabla 'bcv' de Hasura...");
        const insertMutation = {
            query: `
                mutation InsertBcv($currency: String!, $source: String!, $value: numeric!) {
                    insert_bcv_one(object: {currency: $currency, source: $source, value: $value}) {
                        id
                    }
                }
            `,
            variables: {
                currency: moneda,
                source: fuente,
                value: promedio
            }
        };

        const resHasura = await fetch(config.hasuraGqlUrl, {
            method: "POST",
            headers: {
                "x-hasura-admin-secret": config.hasuraSecret,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(insertMutation)
        });
        const dataHasura: any = await resHasura.json();

        if (dataHasura.errors) throw new Error(`Error en Hasura: ${JSON.stringify(dataHasura.errors)}`);
        console.log("--> Insert exitoso en Hasura.");

        // PASO 3: Actualizar Shopify (Tu lógica anterior)
        console.log("3. Iniciando actualización en Shopify...");

        const tasaConRecargo = (promedio * config.markup).toFixed(2);
        const shopifyGqlUrl = `https://${config.shopifyDomain}/admin/api/2024-01/graphql.json`;
        const shopifyHeaders = {
            "X-Shopify-Access-Token": config.shopifyToken,
            "Content-Type": "application/json"
        };

        // Obtener ID de tienda
        const resShop = await fetch(shopifyGqlUrl, {
            method: "POST",
            headers: shopifyHeaders,
            body: JSON.stringify({ query: "{ shop { id } }" })
        });
        const shopData: any = await resShop.json();
        const shopId = shopData.data.shop.id;

        // Mutación Metafield
        const updateMetafield = {
            query: `
                mutation {
                    metafieldsSet(metafields: [{ 
                        ownerId: "${shopId}", 
                        namespace: "custom", 
                        key: "tasa_bcv", 
                        type: "number_decimal", 
                        value: "${tasaConRecargo}" 
                    }]) {
                        userErrors { message }
                    }
                }
            `
        };

        const resUpdate = await fetch(shopifyGqlUrl, {
            method: "POST",
            headers: shopifyHeaders,
            body: JSON.stringify(updateMetafield)
        });

        console.log(`--> Sincronización Finalizada. Tasa en Shopify: ${tasaConRecargo} Bs.`);

    } catch (error) {
        console.error("ERROR EN EL FLUJO:", error);
    }
}

ejecutarSincronizacionTotal();
