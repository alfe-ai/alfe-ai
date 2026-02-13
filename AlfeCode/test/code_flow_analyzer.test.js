const express = require("express");
const { analyzeCodeFlow } = require("../executable/code_flow_analyzer");

describe("code_flow_analyzer", () => {
    let app;

    beforeEach(() => {
        app = express();
    });

    test("analyzes empty app with no routes", () => {
        const routes = analyzeCodeFlow(app);
        expect(routes).toEqual([]);
    });

    test("analyzes app with single GET route", () => {
        app.get("/test", (req, res) => res.send("test"));
        
        const routes = analyzeCodeFlow(app);
        expect(routes).toHaveLength(1);
        expect(routes[0]).toEqual({ method: "GET", path: "/test" });
    });

    test("analyzes app with multiple routes", () => {
        app.get("/users", (req, res) => res.send("get users"));
        app.post("/users", (req, res) => res.send("create user"));
        app.put("/users/:id", (req, res) => res.send("update user"));
        app.delete("/users/:id", (req, res) => res.send("delete user"));
        
        const routes = analyzeCodeFlow(app);
        expect(routes).toHaveLength(4);
        
        const routeMethods = routes.map(r => r.method);
        const routePaths = routes.map(r => r.path);
        
        expect(routeMethods).toContain("GET");
        expect(routeMethods).toContain("POST");
        expect(routeMethods).toContain("PUT");
        expect(routeMethods).toContain("DELETE");
        
        expect(routePaths).toContain("/users");
        expect(routePaths).toContain("/users/:id");
    });

    test("analyzes app with router middleware", () => {
        const router = express.Router();
        router.get("/api/users", (req, res) => res.send("api users"));
        router.post("/api/posts", (req, res) => res.send("create post"));
        
        app.use(router);
        
        const routes = analyzeCodeFlow(app);
        expect(routes).toHaveLength(2);
        
        const routeMethods = routes.map(r => r.method);
        const routePaths = routes.map(r => r.path);
        
        expect(routeMethods).toEqual(["GET", "POST"]);
        expect(routePaths).toEqual(["/api/users", "/api/posts"]);
    });

    test("analyzes app with mixed direct routes and router middleware", () => {
        // Direct routes
        app.get("/home", (req, res) => res.send("home"));
        app.post("/login", (req, res) => res.send("login"));
        
        // Router routes
        const router = express.Router();
        router.get("/api/data", (req, res) => res.send("api data"));
        router.delete("/api/data/:id", (req, res) => res.send("delete data"));
        app.use(router);
        
        const routes = analyzeCodeFlow(app);
        expect(routes).toHaveLength(4);
        
        const expectedRoutes = [
            { method: "GET", path: "/home" },
            { method: "POST", path: "/login" },
            { method: "GET", path: "/api/data" },
            { method: "DELETE", path: "/api/data/:id" }
        ];
        
        expectedRoutes.forEach(expectedRoute => {
            expect(routes).toContainEqual(expectedRoute);
        });
    });

    test("handles routes with parameters", () => {
        app.get("/users/:id", (req, res) => res.send("user by id"));
        app.put("/users/:id/profile", (req, res) => res.send("update profile"));
        app.delete("/users/:id/posts/:postId", (req, res) => res.send("delete post"));
        
        const routes = analyzeCodeFlow(app);
        expect(routes).toHaveLength(3);
        
        const routePaths = routes.map(r => r.path);
        expect(routePaths).toContain("/users/:id");
        expect(routePaths).toContain("/users/:id/profile");
        expect(routePaths).toContain("/users/:id/posts/:postId");
    });

    test("handles routes with query parameters in path", () => {
        app.get("/search?q", (req, res) => res.send("search"));
        app.post("/upload?folder", (req, res) => res.send("upload"));
        
        const routes = analyzeCodeFlow(app);
        expect(routes).toHaveLength(2);
        
        const routePaths = routes.map(r => r.path);
        expect(routePaths).toContain("/search?q");
        expect(routePaths).toContain("/upload?folder");
    });

    test("handles wildcard routes", () => {
        app.get("*", (req, res) => res.send("wildcard"));
        app.use("*", (req, res) => res.send("middleware wildcard"));
        
        const routes = analyzeCodeFlow(app);
        expect(routes).toHaveLength(1); // Only explicit routes are captured, not middleware
        expect(routes[0]).toEqual({ method: "GET", path: "*" });
    });

    test("handles multiple HTTP methods for same path", () => {
        app.get("/resource", (req, res) => res.send("get"));
        app.post("/resource", (req, res) => res.send("post"));
        app.put("/resource", (req, res) => res.send("put"));
        app.delete("/resource", (req, res) => res.send("delete"));
        
        const routes = analyzeCodeFlow(app);
        expect(routes).toHaveLength(4);
        
        const routeMethods = routes.map(r => r.method);
        const routePaths = routes.map(r => r.path);
        
        expect(routeMethods).toEqual(["GET", "POST", "PUT", "DELETE"]);
        expect(routePaths).toEqual(["/resource", "/resource", "/resource", "/resource"]);
    });

    test("handles complex router with nested routes", () => {
        const apiRouter = express.Router();
        const userRouter = express.Router();
        
        // User routes
        userRouter.get("/", (req, res) => res.send("get users"));
        userRouter.post("/", (req, res) => res.send("create user"));
        userRouter.get("/:id", (req, res) => res.send("get user by id"));
        
        // API routes
        apiRouter.use("/users", userRouter);
        apiRouter.get("/health", (req, res) => res.send("health check"));
        
        app.use("/api", apiRouter);
        
        const routes = analyzeCodeFlow(app);
        expect(routes).toHaveLength(4);
        
        const expectedRoutes = [
            { method: "GET", path: "/users" },
            { method: "POST", path: "/users" },
            { method: "GET", path: "/users/:id" },
            { method: "GET", path: "/health" }
        ];
        
        expectedRoutes.forEach(expectedRoute => {
            expect(routes).toContainEqual(expectedRoute);
        });
    });
});