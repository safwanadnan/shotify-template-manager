# Installing an API client 

**You only need to install the API client package if you are not using Gadget-hosted frontends.**

| Methods | Use cases |
| --- | --- |
|     | High-traffic websites, CMS platforms, E-commerce sites |
|     | Use an external React frontend with your preferred code editor |
|     | Web applications with server-side rendering, non-React JS applications |

## Direct script tag 

Gadget generates JavaScript code directly for your web frontend for straightforward integrations into websites. This `<script/>` tag method is the simplest and easiest way to get started using **ai-images**'s API.

```html

  <script src="https://ai-images--development.gadget.app/api/client/web.min.js" defer="defer"></script>
  <script>
    // create a new instance of the Gadget client at the `api` global connected to the Development environment
    window.api = new Gadget()
  </script>
  
```

Once the above script tags have been included, you can access `api` to start making API calls! The generated code is cached on Gadget's CDN and is safe to include directly on high-traffic web properties like a Shopify store or a WordPress blog. We recommend this method of installation for websites when possible, as the client will update without you having to make changes to your code or manually sync with Gadget.

```typescript
const results = await api.query(`
  query GetSomeData {
    # start writing GraphQL queries!
  }
`);
```

Make sure you use your app's production URL when deploying to production.

```html

  <script src="https://ai-images.gadget.app/api/client/web.min.js"></script>
  
```

If you're making requests from a Shopify theme app extension, check out these [Shopify extension docs](https://docs.gadget.dev/guides/http-routes/common-use-cases#hmac-validation) for best practices on making request to your Gadget backend.

## React 

To use your Gadget client with React, you must install both React and the React bindings.

```npm
npm install @gadgetinc/react @gadget-client/ai-images
```

```yarn
yarn add @gadgetinc/react @gadget-client/ai-images
```

If you are using the Gadget-hosted React frontend, these packages are already installed! You don't need to re-add them.

### Creating the client for React apps 

Once your **@gadget-client/ai-images** package has been installed, create an instance of the `Client` class in a shared file somewhere:

This client will be shared by all your React components, so it's best to put this code outside any particular component, or within one of your root components where it can be shared. Be sure to select the appropriate [authentication mode](https://docs.gadget.dev/api/ai-images/development/external-api-calls/authentication) for your use case.

```typescript
import { AiImagesClient } from "@gadget-client/ai-images";
export const api = new AiImagesClient({
  authenticationMode: { browserSession: true },
});
```

If you are using Next.js, or other server-side rendering environments, using browserSession authentication mode will not work, as server-side environments don't support `localStorage`. Instead, instantiate the client without specifying an authentication mode.

```typescript
export const api = new Client()
```

This will default to using the [anonymous](https://docs.gadget.dev/api/ai-images/development/external-api-calls/authentication#anonymous-authentication) authentication mode on the server, and the [browserSession](https://docs.gadget.dev/api/ai-images/development/external-api-calls/authentication#browser-session-authentication) authentication mode on the client.

### Providing the React client 

Once your client is installed and set up, you must provide an instance of your client to your React components using the Gadget React provider. Instantiate the client using the instructions above, and then pass it to the `api` prop of the provider.

```tsx
import { Provider } from "@gadgetinc/react";
import { api } from "shared/api";
const App = () => (
  <Provider api={api}>
    <YourRoutes />
  </Provider>
);
```

**You must re-install the Gadget client if you make breaking changes to the application after installing the client**. See  for more details.

## Node module 

To work with the Gadget API server-side from Node.js, or to include generated Gadget code in a larger product with a JavaScript bundler like Webpack or Parcel, you can install the `npm` module for **ai-images**. Installing the **ai-images** API client works just like any other NPM package and works with any NPM-compatible package manager.

This installation method works by installing the package from Gadget's own `npm` registry, where we host, version, and update your API client.

To install the **ai-images** node package, register the Gadget NPM registry for the `@gadget-client` package scope:

```shell
npm config set @gadget-client:registry https://registry.gadget.dev/npm
```

Then, install the **ai-images** client package using your package manager:

```npm
npm install @gadget-client/ai-images
```

```yarn
yarn add @gadget-client/ai-images
```

As you make changes to **ai-images**, Gadget will publish new versions of your API client to its NPM registry. See [Client Regeneration](https://docs.gadget.dev/api/ai-images/development/external-api-calls/installing#client-regeneration) for more details on when updates are necessary.

**You must register the Gadget `npm` registry in all environments where you want to use this package**, which would include production systems, continuous integration environments, or build steps like Vercel or Netlify's static site builders. This can be done using the above `npm config` command, or by writing out an `.npmrc` file in those environments that points to Gadget for the `@gadget-client` scope.

To indicate to hosting platforms where to find the `@gadget-client/ai-images` package, create an `.npmrc` file in the `web/frontend` directory with the following content:

```markdown

    registry=https://registry.npmjs.org/
    @gadget-client:registry=https://registry.gadget.dev/npm
  
```

After installation, the client module can be required and a client instance created:

```typescript
import { AiImagesClient } from "@gadget-client/ai-images";
export const api = new AiImagesClient();
```

The `api` object is now ready for use!

```typescript
const results = api.query(`
  query GetSomeData {
    # start writing GraphQL queries!
  }
`);
```

Gadget also makes a tarball of the latest version of the API client available for download.

```markdown
https://ai-images--development.gadget.app/api/client/tarball
```

By default, the API Client will not have permission to access data within your application. You can use [API Key authentication](https://docs.gadget.dev/api/ai-images/development/external-api-calls/authentication#api-key-authentication) for server-side apps or [Browser Session authentication](https://docs.gadget.dev/api/ai-images/development/external-api-calls/authentication#browser-session-authentication) for client-side apps to grant a client access.

## Connecting to a specific environment 

Gadget backend apps support two different versions of the application: a Development version for developers constructing and testing their application, and a Production version for end users. The API client can be configured to connect to either environment by passing the `environment` option to the client constructor.

For example, we can always connect to the Development environment by passing the string `"Development"` to the `environment` option:

```typescript
import { AiImagesClient } from "@gadget-client/ai-images";
export const api = new AiImagesClient({
  environment: "Development",
});
// all API calls will be made to the Development environment
```

You can also explicitly connect to the Production environment by passing the string `"Production"` to the `environment` option:

```typescript
import { AiImagesClient } from "@gadget-client/ai-images";
export const api = new AiImagesClient({
  environment: "Production",
});
// all API calls will be made to the Production environment
```

or you can select which environment to connect to based on an environment variable

```typescript
import { AiImagesClient } from "@gadget-client/ai-images";
export const api = new AiImagesClient({
  environment: process.env["IS_PRODUCTION"] == "true" ? "Production" : "Development",
});
```

By default, if no environment is specified the client will set the environment based on `NODE_ENV` if it is set.

## Type safety 

The default TypeScript types are included in the **ai-images** client package, requiring no additional installation steps to utilize them.

The **ai-images** client ensures comprehensive type safety for high-level JavaScript functions like `find` and `findMany`, providing reliable types for API requests and responses. When using the `select` option to retrieve specific fields, the client maps the selected fields to the GraphQL schema, returning an object with the chosen fields and their correct types, as demonstrated in this TypeScript example fetching the id and name of a User model.

```typescript
const users = await api.user.findMany({ select: { id: true, name: true } });

console.log(users[0].id);
// will typecheck just fine as the type `string`, and log an ID string for the user
console.log(users[0].name);
// will typecheck just fine as the type of the `name` field as set in the Gadget Editor, and log the value
console.log(users[0].email);
// will fail the typecheck, as the `email` key was not included in the `select` option
```

## Client regeneration 

The API client source code changes as you make changes to your Gadget backend.

Because the web clients are generated on-demand, we recommend using these clients where possible. By sourcing it directly as a `<script/>` tag, your browser will fetch the most up-to-date code each time a page loads, and you'll always be working with a client guaranteed to work with the current API for the application. To preserve this fast refresh behavior, it is best to not cache the client with other infrastructure (like a proxy) or to save it to disk.

### Updating the npm package 

Gadget's npm registry will publish new versions of your package as changes are made to your Gadget app. You must install the new version of the API client package locally to reflect changes made in the Gadget editor. If a new model is added or removed, it will be available in the generated clients right away, but you need to update your local dependency version to fetch these changes.

To upgrade using npm, run:

```shell
npm install @gadget-client/ai-images@latest-development
```

To upgrade using yarn, run:

```shell
yarn add @gadget-client/ai-images@latest-development
```

**If the package is being used from a Gadget frontend with a Shopify connection set-up, it does not need to be updated as it always applies the latest version**.

#### Updating to only the latest production version 

Upgrading to the `@latest-development` version of the npm package will install the latest version for the development environment. To upgrade to the latest version of the production environment only, you can install the `@latest-production` version. This version of the API client will only reflect changes that have been deployed to production, and will not show changes that are in development but not yet deployed.

To upgrade to only the latest deployed changes using npm, run:

```shell
npm install @gadget-client/ai-images@latest-production
```

To upgrade to only the latest deployed changes using npm, run:

```shell
yarn add @gadget-client/ai-images@latest-production
```

Once changes are deployed, the `@latest` and `@latest-production` versions of the packages will match.

### Best-effort functionality 

If your client version is out of date, that version still makes its best effort to continue to work with new versions of the data model and GraphQL schema. If a breaking change is made the client may try to make requests that no longer work. This can always be remedied by updating any cached source code using `npm` or `yarn`, or by copying new files sourced from Gadget's `web.js` endpoint.

The following changes will break an out-of-date **ai-images** client and cause it to issue invalid requests:

*   changing a model's `apiIdentifier`
*   changing an action's `apiIdentifier`
*   removing an action
*   removing a model completely