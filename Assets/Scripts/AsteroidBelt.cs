using UnityEngine;

public class AsteroidBelt : MonoBehaviour
{
    public Transform center;
    public float orbitSpeed = 15f;
    public float rotationSpeed = 30f;
    public float minDistance = 40f;
    public float maxDistance = 45f;
    
    private float angle;
    private float distance;
    private float verticalOffset;
    
    void Start()
    {
        if (center != null)
        {
            Vector3 offset = transform.position - center.position;
            distance = Mathf.Clamp(offset.magnitude, minDistance, maxDistance);
            angle = Mathf.Atan2(offset.z, offset.x) * Mathf.Rad2Deg;
            verticalOffset = offset.y;
        }
    }
    
    void Update()
    {
        if (center != null)
        {
            angle += orbitSpeed * Time.deltaTime;
            float rad = angle * Mathf.Deg2Rad;
            float x = Mathf.Cos(rad) * distance;
            float z = Mathf.Sin(rad) * distance;
            transform.position = center.position + new Vector3(x, verticalOffset, z);
        }
        
        transform.Rotate(Vector3.up, rotationSpeed * Time.deltaTime, Space.Self);
    }
}
