# Authentication 

The **ai-images** API uses GraphQL over HTTPS to communicate with clients. Purpose-built GraphQL clients as well as HTTP clients like fetch, cURL, or the HTTP library for your programming language of choice can be used to communicate with your Gadget app's API.

Gadget generates a JavaScript client for the **ai-images** API which handles authentication automatically. We recommend using these clients where possible.

## Authentication modes 

The Gadget API supports four different authentication modes:

| Mode | Description | Use cases |
| --- | --- | --- |
|     | Gadget stores a session token (similar to a cookie) in the user's browser, and sends it in the `Authorization` header | Client-side applications, browser single sign-on, user login/logout flows |
|     | The client uses the `SignUpUser` and `SignInUser` Gadget GraphQL endpoints to generate a session token | Client-side applications not written in JS/TS, mobile apps with a Gadget backend |
|     | No authentication header sent at all | Publicly accessible data, ecommerce storefronts |
|     | Copy a `gsk-xxxxxx` API Key from the API Keys page in the editor, and pass it in the `Authorization` header | Server-to-server communication, bots, scripts |
| [Shopify Session Token](https://docs.gadget.dev/guides/plugins/shopify/building-shopify-apps) | Auth managed by Shopify's session tokens and [@gadgetinc/react-shopify-app-bridge](https://docs.gadget.dev/reference/shopify-app-bridge) | Apps embedded in the Shopify admin |

The API client will use Browser Session authentication by default if it detects that it's running in a browser environment, and use Anonymous authentication by default if not running in a browser.

## Browser session authentication 

Gadget can use session tokens to authenticate individual users to the backend. Session tokens work similarly to cookies. Clients will receive a private session token representing that one client's browser, and the token will be represented in the backend by one record of the application's **Session** model. The client can then run Actions on this session record to change their authorization state.

If you're building a client-side application where authenticated users should have access to different data than unauthenticated users, then Browser Session Authentication is a great option. Unauthenticated users will have the `Unauthenticated` role which can allow them to access some data (or none at all), and then once a user logs in, they can be given a role with different permissions.

Browser Session authentication with Gadget works quite similarly to cookie-based authentication in other systems, but Gadget doesn't actually use cookies under the hood to make cross-domain authentication work better across different browsers. Instead, Gadget uses the `Authorization` header to implement a similar scheme, and the generated JavaScript client uses `localStorage` to store the private session token.

Read more about implementing roles and permissions for your app in the [Access Control](https://docs.gadget.dev/guides/access-control) guide.

### Enabling browser authentication 

If you're using the Gadget JavaScript client for **ai-images** in a browser context, and you want to allow the user to log in and stay logged in, you can request that the Gadget client track a user's session token with the `browserSession: true` authentication mode.

```typescript
import { AiImagesClient } from "@gadget-client/ai-images";
const api = new AiImagesClient({
  authenticationMode: {
    browserSession: true,
  },
});
```

### Storage modes for session persistence 

The JS client has three modes for storing the session token which uniquely identifies the user to allow full configuration of how long a user's session might last. To configure which storage mode is used for session token persistence, pass the `storageType` option like so:

```typescript
import { AiImagesClient, BrowserSessionStorageType } from "@gadget-client/ai-images";
const api = new AiImagesClient({
  authenticationMode: {
    browserSession: {
      storageType: BrowserSessionStorageType.Session,
    },
  },
});
```

#### Set Shopify's shop tenancy to the session 

In cases where you want to set Shopify's shop tenancy to the session, you can pass the `shopId` option to the `browserSession` authentication mode. This is useful when you want to run actions or HTTP requests on behalf of a specific shop in Shopify theme extensions.

Note that `shopId` property does not set up any Shopify authentications and permissions.

Below is an example of how to set up the client in a Shopify theme extension's Liquid file.

```liquid

  <script src="https://ai-images--development.gadget.app/api/client/web.min.js" defer="defer"></script>
  <script>
  document.addEventListener("DOMContentLoaded", function () {
    const client = new Gadget({
      authenticationMode: {
        browserSession: {
          shopId: {{ shop.id }},
        },
      },
    });
  })
  </script>
  
```

In Shopify theme extensions, Shopify automatically provides the `shop` object to the Liquid context that represents the shop that the theme is being rendered on. We can use this to set the shop tenancy to the session.

For more information on the `shop` object, check out the [Shopify documentation](https://shopify.dev/docs/api/liquid/objects/shop).

To access the current shop in action code or the HTTP route handlers, you can use the `connections.shopify.currentShop` property.

```typescript
export const run: ActionRun = async ({
  params,
  logger,
  api,
  connections,
  session,
}) => {
  const currentShop = connections.shopify.currentShop;
  // ...
};
```

#### Long-lived sessions with `BrowserSessionStorageType.Durable` (Default) 

In this mode, the client will persist the user's session token using [`window.localStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage). This means the user's session will last generally a long time -- until the user clears local storage or the browser decides it has expired. This option is a good default for applications where users log in and can stay logged in for a long time.

```typescript
import { AiImagesClient, BrowserSessionStorageType } from "@gadget-client/ai-images";
const api = new AiImagesClient({
  authenticationMode: {
    browserSession: {
      storageType: BrowserSessionStorageType.Durable,
    },
  },
});
```

#### Short-term sessions with `BrowserSessionStorageType.Session` 

In this mode, the client will persist the user's session token using [`window.sessionStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage). This means the user's session will last until they close the tab, which is generally a short time. Users can navigate between pages of the application, or open new tabs and preserve it, but generally sessions stored with `BrowserSessionStorageType.Session` will be short lived.

This option is a good default for applications where users log in to something very sensitive, or for applications where the user's identity is ephemeral like a browser game or sales chat app.

```typescript
import { AiImagesClient, BrowserSessionStorageType } from "@gadget-client/ai-images";
const api = new AiImagesClient({
  authenticationMode: {
    browserSession: {
      storageType: BrowserSessionStorageType.Session,
    },
  },
});
```

#### Single page sessions with `BrowserSessionStorageType.InMemory` 

In this mode, the client will not persist the user's session, so it will only last while that one page is active in the user's browser. This means the user's session will last until they navigate away from the page, close the tab, refresh, or do anything to reset the JS context of the page, which is generally a short time.

```typescript
import { AiImagesClient, BrowserSessionStorageType } from "@gadget-client/ai-images";
const api = new AiImagesClient({
  authenticationMode: {
    browserSession: {
      storageType: BrowserSessionStorageType.Session,
    },
  },
});
```

### Session token authentication 

Session token authentication is for client-side authentication in **non-JavaScript environments**. Let’s say you have a mobile app written in Swift and you want to make calls from the app to your Gadget GraphQL API. Session token authentication is the right choice.

Session token authentication is done in 5 steps:

1.  _Sign up_. Include a new user's email and password in `SignUpUser` GQL mutation.
2.  _Email verification_. Gadget sets up email verification for you. Users can sign in once they verify their email.
3.  _Sign in_. Send a users's email and password in the `SignInUser` GQL mutation.
4.  _Get session token_. Parse the response from the `SignInUser` mutation. Gadget stores the session token in a custom response header field called `x-set-authorization`. Store this token for the duration of the user's session.
5.  _Authenticate via session token_. To make an authenticated request, add the session token to the `Authorization` header:

```python
  headers = {
    "Content-Type": "application/json",
    "Authorization": session_token
  }

response = requests.post(
graphql_endpoint,
json={"query": query, "variables": {}},
headers=headers
)
```

```swift
let url = URL(string: baseUrl)!
var urlRequest = URLRequest(url: url)
urlRequest.httpMethod = "POST"
urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
urlRequest.setValue(sessionToken, forHTTPHeaderField: "Authorization")
```

#### Sign up example 

[When email/password or Google SSO authentication is included in your Gadget app](https://docs.gadget.dev/guides/plugins/authentication#how-authentication-in-gadget-works), Gadget automatically creates the GraphQL endpoints and code that you can use to authenticate users.

Use the auto-generated `SignUpUser` mutation to create a new user by providing their username and password:

```python
  import requests
  import json

def sign_up_user_request(email, password, graphql_endpoint):
mutation = """
mutation SignUpUser($email: String!, $password: String!) {
signUpUser(email: $email, password: $password) {
success
user {
_all
}
errors {
message
}
}
}
"""

      variables = {
          "email": email,
          "password": password
      }

      payload = {
          "query": mutation,
          "variables": variables
      }

      headers = {
          "Content-Type": "application/json"
      }

      try:
          response = requests.post(
              graphql_endpoint,
              json=payload,
              headers=headers
          )
          response.raise_for_status()
          return response.json()
      except requests.exceptions.RequestException as e:
          return {"error": f"Request failed: {str(e)}"}
```

```swift
import Foundation

let baseUrl = "https://ai-images--development.gadget.app/api/graphql"

struct SignUpRequest {
let email: String
let password: String
}

func signUp(_ request: SignUpRequest) async throws -> HTTPURLResponse {
let mutation = """
mutation SignUpUser($email: String!, $password: String!) {
signUpUser(email: $email, password: $password) {
success
errors { message }
}
}
"""

    let payload: [String: Any] = [
      "query": mutation,
      "variables": ["email": request.email, "password": request.password],
    ]

    guard
      let url = URL(string: baseUrl),
      let body = try? JSONSerialization.data(withJSONObject: payload)
    else { throw URLError(.badURL) }

    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.httpBody = body
    req.addValue("application/json", forHTTPHeaderField: "Content-Type")

    let (_, response) = try await URLSession.shared.data(for: req)
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    return http

}

Task {
do {
let res = try await signUp(SignUpRequest(email: "gabe@gadget.dev", password: "Test123!@#"))
print("Status Code: (res.statusCode)")
print("Response: (res)")
} catch {
print("Error: (error.localizedDescription)")
}

    exit(0)

}

RunLoop.main.run()
```

This will create a new `user` record in the Gadget database. Gadget has email verification built in. Once you sign up, you need to verify your email to sign in.

#### Sign in example 

The `SignInUser` method takes in the `email` and `password` parameters just like `SignUpUser`. When the user is successfully signed in, a new session is created.

```python
  import requests
  import json

def sign_in_user_request(email, password, graphql_endpoint):
mutation = """
mutation SignInUser($email: String!, $password: String!) {
signInUser(email: $email, password: $password) {
success
user {
_all
}
errors {
message
}
}
}
"""

    variables = {
        "email": email,
        "password": password
    }

    payload = {
        "query": mutation,
        "variables": variables
    }

    headers = {
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(
            graphql_endpoint,
            json=payload,
            headers=headers
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        return {"error": f"Request failed: {str(e)}}"
```

```swift

import Foundation

let baseUrl = "https://ai-images--development.gadget.app/api/graphql"

struct SignInRequest {
let email: String
let password: String
}

func signIn(_ request: SignInRequest) async throws -> HTTPURLResponse {
let mutation = """
mutation SignInUser($email: String!, $password: String!) {
signInUser(email: $email, password: $password) {
success
user { id email }
errors { message }
}
}
"""

    let payload: [String: Any] = [
      "query": mutation,
      "variables": ["email": request.email, "password": request.password],
    ]

    guard
      let url = URL(string: baseUrl),
      let body = try? JSONSerialization.data(withJSONObject: payload)
    else { throw URLError(.badURL) }

    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.httpBody = body
    req.addValue("application/json", forHTTPHeaderField: "Content-Type")

    let (_, response) = try await URLSession.shared.data(for: req)
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    if let sessionToken = httpResponse.allHeaderFields["x-set-authorization"] as? String {
      // TODO: Implement storeSession
      storeSession(sessionToken)
    }

    return http

}

Task {
do {
let res = try await signIn(SignInRequest(email: "test@example.com", password: "Test123!@#"))
print("Status Code: (res.statusCode)")
print("Response: (res)")
} catch {
print("Error: (error.localizedDescription)")
}

    exit(0)

}

RunLoop.main.run()
```

The response includes a session token you can use to authenticate API requests make from any external client.

Get the token from the response header, then include that token in all future requests.

#### Example request 

Here's an example GraphQL request that reads the session token and makes an authenticated request:

```python
  import requests

ENDPOINT = "https://ai-images--development.gadget.app/api/graphql"
EMAIL = "<user's email>"
PASS = "user's password"

def sign_in_user_request(email, password, graphql_endpoint):
mutation = """
mutation SignInUser($email: String!, $password: String!) {
signInUser(email: $email, password: $password) {
success
user {
_all
}
errors {
message
}
}
}
"""

      variables = {
          "email": email,
          "password": password
      }

      payload = {
          "query": mutation,
          "variables": variables
      }

      headers = {
          "Content-Type": "application/json",
      }

      try:
          response = requests.post(
              graphql_endpoint,
              json=payload,
              headers=headers
          )
          response.raise_for_status()
          return response.json()
      except requests.exceptions.RequestException as e:
          return {"error": f"Request failed: {str(e)}}"

def get_meal_plans(graphql_endpoint, session_token):
query = """
query{
mealPlans{
edges{
node{
id
name
description
}
}
}
}
"""

      headers = {
          "Content-Type": "application/json",
          "Authorization": session_token
      }

      try:
          response = requests.post(
                  graphql_endpoint,
                  json={"query": query, "variables": {}},
                  headers=headers
          )
          response.raise_for_status()
          return response
      except requests.exceptions.RequestException as e:
          return {"error": f"Request failed: {str(e)}"}

sign_in_response = sign_in_user_request(EMAIL, PASS, ENDPOINT)

# The session token is in the x-set-authorization response header

session_token = sign_in_response.headers["x-set-authorization"]

meal_plan_response = get_meal_plans(ENDPOINT, session_token)
print(meal_plan_response.json())
```

```swift
import Foundation

let sessionKey = "com.example.userSession"
let baseUrl = "https://ai-images--development.gadget.app/api/graphql"
let keychain = KeychainManager.shared

struct UserSession: Codable {
let userId: String
let email: String
let sessionToken: String
let expiresAt: Date
var isValid: Bool {
expiresAt > Date()
}
}

struct SignInRequest {
let email: String
let password: String
}

enum AuthError: LocalizedError {
case invalidCredentials
case tokenExpired
case invalidResponse
case unknown(String)
var errorDescription: String? {
switch self {
case .invalidCredentials:
return "Invalid email or password"
case .tokenExpired:
return "Session expired. Please sign in again"
case .invalidResponse:
return "Invalid response from server"
case .unknown(let message):
return message
}
}
}

private func storeSession(_ session: UserSession) {
if let sessionData = try? JSONEncoder().encode(session) {
keychain.save(sessionData, forKey: sessionKey)
}
}

func signIn(with request: SignInRequest) async throws -> HTTPURLResponse {
let mutation = """
mutation SignInUser($email: String!, $password: String!) {
signInUser(email: $email, password: $password) {
success
user {
id
email
}
errors {
message
}
}
}

      """

      let variables: [String: Any] = [
          "email": request.email,
          "password": request.password,]

      let payload: [String: Any] = [
          "query": mutation,
          "variables": variables,]

      guard let url = URL(string: baseUrl),
      let httpBody = try? JSONSerialization.data(withJSONObject: payload)
      else {
          throw AuthError.unknown("Invalid API URL")
      }

      var urlRequest = URLRequest(url: url)
      urlRequest.httpMethod = "POST"
      urlRequest.httpBody = httpBody
      urlRequest.addValue("application/json", forHTTPHeaderField: "Content-Type")
      let (data, response) = try await URLSession.shared.data(for: urlRequest)

      guard let httpResponse = response as? HTTPURLResponse else {
          throw AuthError.invalidResponse
      }

      let statusCode = httpResponse.statusCode
      if statusCode >= 300 {
          if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let errors = json["errors"] as? [[String: Any]]
          {
              let errorMessages = errors.compactMap {
                  $0["message"] as? String
              }
              if !errorMessages.isEmpty {
                  throw AuthError.unknown(errorMessages.joined(separator: " "))
              }
          }
          if let responseString = String(data: data, encoding: .utf8), !responseString.isEmpty {
              throw AuthError.unknown(responseString)
          }
          throw AuthError.unknown("Request failed with HTTP status code: (statusCode)")
      }

      guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let dataDict = json["data"] as? [String: Any],
      let signInUser = dataDict["signInUser"] as? [String: Any]
      else {
          if let jsonString = String(data: data, encoding: .utf8) {
              print("Failed to parse JSON. Raw data:")
              print(jsonString)
          }
          else {
              print("Failed to parse JSON and couldn't convert data to string")
              print("Data byte count: (data.count)")
          }
          throw NSError(
              domain: "ParsingError", code: 400,
              userInfo: [NSLocalizedDescriptionKey: "Invalid JSON format"])
      }

      if let errorList = signInUser["errors"] as? [[String: Any]] {
          let errorMessages = errorList.compactMap {
              $0["message"] as? String
          }
          if errorMessages.contains(where: {
              $0.contains("nvalid email or password")
          })
          {
              throw AuthError.invalidCredentials
          }
          if !errorMessages.isEmpty {
              throw AuthError.unknown(errorMessages.joined(separator: " "))
          }
      }

      if let userInfo = signInUser["user"] as? [String: Any],
      let userId = userInfo["id"] as? String,
      let email = userInfo["email"] as? String
      {
          // Get the session token from the x-set-authorization header
          if let sessionToken = httpResponse.allHeaderFields["x-set-authorization"] as? String {
              let currentDate = Date()
              let calendar = Calendar.current
              let oneMonthFromNow = calendar.date(byAdding: .month, value: 1, to: currentDate)!
              let session = UserSession(
                  userId: userId, email: email, sessionToken: sessionToken, expiresAt: oneMonthFromNow)
              storeSession(session)
          }
      }

      return httpResponse

}

func getMealPlans(sessionToken: String, completion: @escaping (Result<Data, Error>) -> Void) {
let query = """
query {
mealPlans {
edges {
node {
id
name
description
}
}
}
}
"""

      let url = URL(string: baseUrl)!
      var urlRequest = URLRequest(url: url)
      urlRequest.httpMethod = "POST"
      urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
      urlRequest.setValue(sessionToken, forHTTPHeaderField: "Authorization")

      let requestBody: [String: Any] = [
          "query": query,
          "variables": [:],]
      urlRequest.httpBody = try! JSONSerialization.data(withJSONObject: requestBody)

      let task = URLSession.shared.dataTask(with: urlRequest) {
          data, response, error in

          guard let data = data else {
              return
          }
          completion(.success(data))
      }

      task.resume()

}

class KeychainManager {
static let shared = KeychainManager()
private init() {}

      func save(_ data: Data, forKey key: String) {
          let query: [String: Any] = [
              kSecClass as String: kSecClassGenericPassword,
              kSecAttrAccount as String: key,
              kSecValueData as String: data,]
          SecItemDelete(query as CFDictionary)
          SecItemAdd(query as CFDictionary, nil)
      }

      func getData(_ key: String) -> Data? {
          let query: [String: Any] = [
              kSecClass as String: kSecClassGenericPassword,
              kSecAttrAccount as String: key,
              kSecReturnData as String: true,
              kSecMatchLimit as String: kSecMatchLimitOne,]
          var dataTypeRef: AnyObject?
          let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
          if status == errSecSuccess {
              return dataTypeRef as? Data
          }
          return nil
      }

}

Task {
// Load the session that was stored in the KeyChain when the user signed in
// We store the session token in the KeyChain when signIn is called
if let sessionData = keychain.getData(sessionKey),
let session = try? JSONDecoder().decode(UserSession.self, from: sessionData)
{
if session.isValid {
getMealPlans(sessionToken: session.sessionToken) {
result in
if case .success(let data) = result {
let json = try! JSONSerialization.jsonObject(with: data)
print(json)
}
}
}
else {
throw AuthError.tokenExpired
}
}
}

RunLoop.main.run()
```

## Anonymous authentication 

It can be convenient to allow anyone without an API Key to access some data in your application. For example, anyone on the internet should be able to visit a blog and read the posts, or visit an ecommerce storefront and view the products, so no authentication is needed for this kind of data.

To use Anonymous authentication, make requests without sending an API key or a browser session token. Requests to the **ai-images** app without any authentication information will be assigned the `Unauthenticated` role. The Gadget application developer will need to grant the `Unauthenticated` role permission to access this publicly-available data. If the `Unauthenticated` Role for the application hasn't been granted any permissions, requests made without an API Key won't be able to read or write any data.

To create a client that uses no authentication, pass `anonymous: true` to the `authenticationMode` option when creating the client:

```typescript
import { AiImagesClient } from "@gadget-client/ai-images";
const api = new AiImagesClient({
  authenticationMode: {
    anonymous: true,
  },
});
```

## API key authentication 

The Gadget API uses API Keys to authenticate requests. API keys are secret strings accessible through the [Gadget Editor](https://ai-images.gadget.app/edit/settings/api-keys). API Keys grant the holder permission to read and write different pieces of data depending on which roles the key has been assigned.

API Keys always start with the three letters `gsk` (standing for Gadget Secret Key), so they look something like `gsk-a1z1z1z1z1z1z1z1z11z`. Security best practices mandate that you don't commit sensitive data like API keys to your code base, and instead use something like environment variables to pass them to code in production. GitGuardian has a great reference on [how to accomplish this](https://blog.gitguardian.com/secrets-api-management/).

Don't send API keys to the browser as they can be read from the source code and used for malicious purposes.

API Key authentication is useful for server-to-server communication where the client code is trusted.

If you're building a server-side application that will write data to the **ai-images** datastore, API keys are the easiest way to authenticate and limit permissions.

### Sending an API key 

If you're using the Gadget JavaScript client for **ai-images**, you can pass your API Key as an option to the client when constructing it.

```typescript
import { AiImagesClient } from "@gadget-client/ai-images";
const api = new AiImagesClient({
  authenticationMode: { apiKey: "gsk-a1z1z1z1z1z1z1z1z11z" },
});
```

The `client` object will automatically pass the API Key to the API for each request it makes.

If you're making requests using some other HTTP client, you must pass the API Key as the token using HTTP Bearer Auth. HTTP requests to the GraphQL endpoint at `https://ai-images--development.gadget.app/api/graphql` should use Bearer Token authentication in the headers to do this.

This means passing the HTTP `Authorization` header with the value `Bearer gsk-a1z1z1z1z1z1z1z1z11z`, replacing that example API Key with a valid API Key from the [Gadget Editor](https://ai-images.gadget.app/edit/settings/api-keys).

For example, you can make an authenticated request with `curl` by passing the `Authorization` header.

```bash
curl -H "Authorization: Bearer gsk-a1z1z1z1z1z1z1z1z11z" -X POST https://ai-images--development.gadget.app/api/graphql ...
```

### Shopify Session Token authentication 

Your app's Gadget API supports authenticating users accessing a Shopify web property that provides a Shopify session token. If the API client detects execution within Shopify (via the `window.shopify` App Bridge property), it will automatically pass a Shopify session token to your backend and authenticate as this merchant or customer in the backend.

Shopify Session Token authentication is automatically enabled without passing any options when the App Bridge is detected. If you want to explicitly disable it, pass a different authentication mode like `anonymous: true` or `browserSession: true`. Shopify Session Token authentication is only available in the browser.

## Authentication failures 

If an invalid API Key is passed to Gadget, the API will return an error in the GraphQL error format as a JSON response like so:

```json
{
  "errors": [
    {
      "message": "Invalid API Key."
    }
  ],
  "data": null
}
```

**This error is only returned if an API Key is used to authenticate.** If no `Authorization` header is sent with the request, which means no API Key has been passed, Gadget treats the request as an anonymous one, and permits or denies access to data using the `Unauthenticated` role.

## Enabling authentication with the React client 

The `urql` client (built on top of the Gadget React bindings) that the **ai-images** client provides is pre-configured to connect to the right Gadget platform GraphQL endpoint and uses the same authentication mechanism that the outer Gadget client uses. If you configure the Gadget client to use a browser session, the `urql` client will use the same browser session. If you configure you Gadget client to use API key authentication, the `urql` client will use that same API key.

React is a client side framework and your code is likely to be visible to all the users of your application. For this reason, Gadget recommends using [Session Cookie based authentication](https://roadmap.sh/guides/session-based-authentication) for accessing the Gadget API. You shouldn't use an API key that has write permissions for authenticating as that API key will be available to any client and ripe for abuse. You can instead use session-based authentication where users must log in to get privileges, or you can leave the client in the unauthenticated mode and grant permissions to read some backend data to the `Unauthenticated` role.