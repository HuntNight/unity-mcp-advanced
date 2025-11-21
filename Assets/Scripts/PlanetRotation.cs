using UnityEngine;

public class PlanetRotation : MonoBehaviour
{
    public Transform center;
    public float orbitSpeed = 10f;
    public float rotationSpeed = 50f;
    
    private Vector3 initialPosition;
    private float angle;
    
    void Start()
    {
        if (center != null)
        {
            initialPosition = transform.position - center.position;
            angle = Mathf.Atan2(initialPosition.z, initialPosition.x) * Mathf.Rad2Deg;
        }
    }
    
    void Update()
    {
        if (center != null)
        {
            angle += orbitSpeed * Time.deltaTime;
            float rad = angle * Mathf.Deg2Rad;
            float radius = initialPosition.magnitude;
            transform.position = center.position + new Vector3(Mathf.Cos(rad) * radius, 0, Mathf.Sin(rad) * radius);
        }
        
        transform.Rotate(Vector3.up, rotationSpeed * Time.deltaTime, Space.Self);
    }
}
