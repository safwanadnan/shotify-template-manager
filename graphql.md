# GraphQL 

### Connection Details 

All requests to the GraphQL endpoint should be made with the `Content-Type` header set to `application/json`, and all responses from the GraphQL endpoint will be returned with the `Content-Type` response header set to `application/json`. The **ai-images** GraphQL API is spec compliant.

To make requests to the Development GraphQL API, use the following URL:

```markdown
https://ai-images--development.gadget.app/api/graphql
```

To make requests to the Production GraphQL API, use the following URL:

```markdown
https://ai-images.gadget.app/api/graphql
```

### Developing using the API Playground 

Gadget serves a web-based request console for easy development of custom or complicated queries at  [ai-images GraphQL playground](https://ai-images.gadget.app/api/playground/graphql?environment=development). It's handy for exploring the **ai-images** API and supports handy features like autocomplete, saved queries, and pretty output formatting.

### Connecting with the Gadget API Client 

Gadget generates a type-safe, high-quality npm package that can be used in frontend and backend JavaScript projects for the **ai-images** API. Find instructions for setting up the API client on the [Installing](https://docs.gadget.dev/api/ai-images/development/external-api-calls/installing) page.

#### Executing Queries 

With a set up `GadgetClient` object, you can access data with the `.query` function. For more information on the return type of the `.query` method, consult the `urql` [`client.query`](https://formidable.com/open-source/urql/docs/api/core/#clientquery) docs.  
  
`.query` returns a `Promise` for the data from the API in the same shape that the GraphQL query is written. The `response` object has the data at the `data` property.

```typescript
const response = await api.query(`
  query GetAppName {
    gadgetMeta {
      slug
    }
  }
`);

console.log(response.data.gadgetMeta.slug);
// => ai-images
```

### Connecting with `fetch` 

Gadget's GraphQL API can be used without any wrapper client library in JavaScript by using `fetch`.

```typescript
const result = await fetch("https://ai-images--development.gadget.app/api/graphql", {
  headers: {
    accept: "application/json",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    query: `
      query GetAppName {
        gadgetMeta {
          name
        }
      }
    `,
  }),
  method: "POST",
});
```

Gadget generally recommends using the provided [API Client](https://docs.gadget.dev/api/ai-images/development/external-api-calls/installing) package where possible.

### Connecting with `cURL` 

Gadget's GraphQL API can be used from command line HTTP clients like `cURL` as well:

```shell

  curl 'https://ai-images--development.gadget.app/api/graphql' \
    -H 'accept: application/json' \
    -H 'content-type: application/json' \
    --data-raw '{"query":"query { gadgetMeta { slug } }"}'
  
```

## GraphQL types 

Gadget maps Gadget field types to specific GraphQL types for easy consumption of rich data via the GraphQL API.

GraphQL Type: `GadgetGraphQLID`

Custom GraphQL scalar representing Gadget ID values as strings.

GraphQL Type: `GraphQLString`

GraphQL Type: `GraphQLBoolean`

GraphQL Type: `GraphQLURL` or `GraphQLString`

Returns a custom GraphQLURL scalar if URL validation is turned on, and a string otherwise

GraphQL Type: `GraphQLEmailAddress` or `GraphQLString`

Returns a custom GraphQLEmailAddress scalar if URL validation is turned on, and a string otherwise

GraphQL Type: `[GraphQLString!]`

Returns a list of strings

GraphQL Type: `GraphQLRichText`

Returns a custom object representing the rich text, with html, markdown and truncatedHTML fields for accessing the content in different ways

GraphQL Type: `GraphQLDate` or `GraphQLDateTime`

Returns a full GraphQLDateTime if the Include Time option is on, and a GraphQLDate otherwise

GraphQL Type: `GraphQLInt` or `GraphQLFloat`

Returns a GraphQLFloat if the allowed number of decimals is unset or greater than 0, and a GraphQLInt otherwise

GraphQL Type: `GraphQLJSON`

JSON fields are used to store valid JSON. Valid values can be objects, arrays, or scalars including strings and numbers.

GraphQL Type: `GraphQLJSON`

Deprecated. Any fields act the same as JSON fields.

GraphQL Type: `<related object type>`

Returns the GraphQL type for the related model.

GraphQL Type: `<related object type>`

Returns the GraphQL type for the related model.

GraphQL Type: `<related object type>Connection`

Returns a [Relay style Connection](https://graphql.org/learn/pagination/#complete-connection-model) interface for accessing the list of related records. The connection has the pageInfo and edges properties.

GraphQL Type: `<related object type>Connection`

Returns a [Relay style Connection](https://graphql.org/learn/pagination/#complete-connection-model) interface for accessing the list of related records. The connection has the pageInfo and edges properties.

### Required 

All of the Gadget GraphQL types are governed by the Required option, which marks them as not null in the GraphQL API's accepted inputs and returned data. Changing the Required-ness of a field in the Gadget Editor will reflect in the GraphQL API immediately.