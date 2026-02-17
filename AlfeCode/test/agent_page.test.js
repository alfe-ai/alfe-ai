const axios = require("axios");
const fs = require("fs");
const path = require("path");

describe("Agent page integration test", () => {
    const baseUrl = "http://localhost:3000";

    it("GET /agent should return 200 and contain subscribe button", async () => {
        try {
            const response = await axios.get(`${baseUrl}/agent`);
            expect(response.status).toBe(200);
            expect(response.data).toContain("id=\"subscribeButton\"");
            expect(response.data).toContain("id=\"subscribeModal\"");
        } catch (error) {
            if (error.response) {
                console.log(`Error response status: ${error.response.status}`);
                console.log(`Error response data: ${error.response.data}`);
            }
            throw error;
        }
    });

    it("GET /agent/model-only should return 200", async () => {
        try {
            const response = await axios.get(`${baseUrl}/agent/model-only`);
            expect(response.status).toBe(200);
        } catch (error) {
            if (error.response) {
                console.log(`Error response status: ${error.response.status}`);
                console.log(`Error response data: ${error.response.data}`);
            }
            throw error;
        }
    });
});