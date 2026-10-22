
package dev.erm.demo;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
class DemoApplicationTests {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void healthEndpointShouldReturnUp() {
        assertHealthEndpoint("/actuator/health");
    }

    @Test
    void livenessEndpointShouldReturnUp() {
        assertHealthEndpoint("/actuator/health/liveness");
    }

    @Test
    void readinessEndpointShouldReturnUp() {
        assertHealthEndpoint("/actuator/health/readiness");
    }

    private void assertHealthEndpoint(String path) {
        ResponseEntity<String> response = restTemplate.getForEntity(
                "http://localhost:" + port + path,
                String.class
        );

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).contains("\"status\":\"UP\"");
    }
}
